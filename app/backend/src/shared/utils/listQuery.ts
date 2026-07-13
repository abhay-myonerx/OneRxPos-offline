// Standard list-query utilities for v2 modules — combines pagination,
// sortBy whitelist, search, and filter parsing into one factory.
//
// Why a factory: every list endpoint expresses three module-specific
// things — which fields are sortable, which fields are searched in a
// free-text `search` query string, and any extra filter shape. The
// shared bits (page/limit/sortOrder, total/totalPages/hasMore) are
// identical across modules, so we keep them in one place.
//
// Usage (in a v2 module):
//
//   const userListQuerySchema = createListQuerySchema({
//       sortable: ["createdAt", "lastName", "email"],
//       defaultSortBy: "createdAt",
//       filters: z.object({
//           role: z.string().optional(),
//           storeId: z.string().uuid().optional(),
//           isActive: z.coerce.boolean().optional(),
//       }),
//   });
//
//   const params = userListQuerySchema.parse(req.query);
//   const { where, orderBy, skip, take, meta } = buildPrismaListQuery(
//       params,
//       {
//           searchableFields: ["firstName", "lastName", "email"],
//           extraWhere: { ...tenantScopedExtras },
//       },
//   );
//   const [rows, total] = await Promise.all([
//       db.user.findMany({ where, orderBy, skip, take }),
//       db.user.count({ where }),
//   ]);
//   return formatListResponse(rows, total, meta);
//
// This is **additive**. v1 list endpoints continue to use
// `paginationSchema` from `pagination.ts` (per A-006). New v2
// endpoints should prefer this builder so sortBy is whitelisted
// (defense-in-depth against `?sortBy=passwordHash`).

import { z, type ZodTypeAny, type ZodObject } from "zod";
import { ciContains } from "./ci-match";

import { formatPaginatedResponse, type PaginationParams } from "./pagination";

// ─── Schema factory ────────────────────────────────────────────────────────────

export interface ListQuerySchemaOptions<TFilters extends ZodObject<Record<string, ZodTypeAny>>> {
  /**
   * Field names allowed in `?sortBy=`. Anything else is rejected with
   * a validation error rather than silently passed through to Prisma.
   */
  sortable: readonly [string, ...string[]];

  /** Default sort field used when the client omits `?sortBy=`. */
  defaultSortBy?: string;

  /** Default sort order. Most v2 endpoints prefer `desc` on `createdAt`. */
  defaultSortOrder?: "asc" | "desc";

  /** Module-specific filter object schema, merged into the query schema. */
  filters?: TFilters;

  /** Override max `limit` for endpoints that need to cap higher/lower. */
  maxLimit?: number;
}

/**
 * Build a Zod schema for a list endpoint's query string. The returned
 * schema validates and coerces `page`, `limit`, `sortBy`, `sortOrder`,
 * `search`, and any provided filter fields.
 */
export function createListQuerySchema<TFilters extends ZodObject<Record<string, ZodTypeAny>>>(
  opts: ListQuerySchemaOptions<TFilters>,
) {
  const sortableEnum = z.enum(opts.sortable as unknown as [string, ...string[]]);

  const defaultSortBy = opts.defaultSortBy ?? opts.sortable[0];
  if (!opts.sortable.includes(defaultSortBy)) {
    throw new Error(`defaultSortBy "${defaultSortBy}" must be in sortable list`);
  }

  const base = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(opts.maxLimit ?? 100)
      .default(20),
    sortBy: sortableEnum.default(defaultSortBy),
    sortOrder: z.enum(["asc", "desc"]).default(opts.defaultSortOrder ?? "desc"),
    search: z.string().trim().min(1).optional(),
  });

  // The conditional `base.merge(...)` collapses TFilters in the
  // inferred return type, so we cast back to the merged shape and
  // let `z.infer` see the filter fields. The runtime path is
  // identical to the previous version.
  type Merged = z.ZodObject<typeof base.shape & TFilters["shape"]>;
  return (opts.filters ? base.merge(opts.filters) : base) as unknown as Merged;
}

export type ListQueryParams<TFilters = Record<string, never>> = PaginationParams & {
  search?: string;
} & TFilters;

// ─── Prisma builder ────────────────────────────────────────────────────────────

export interface BuildPrismaListQueryOptions {
  /**
   * Fields used to expand `search` into an `OR` containing
   * case-insensitive `contains` filters. Pass only safe public
   * columns — never `passwordHash` etc.
   */
  searchableFields?: readonly string[];

  /**
   * Extra `where` clauses to AND with the auto-built ones. Use this
   * for tenant-scope guards or join filters. NEVER trust user input
   * here — the caller derives them from authenticated context.
   */
  extraWhere?: Record<string, unknown>;

  /**
   * Map of filter keys to Prisma where shape. By default each filter
   * is applied as `{ [key]: value }`. Override here for special cases
   * like date ranges or relational filters.
   */
  filterMap?: Record<string, (value: unknown) => Record<string, unknown>>;
}

export interface PrismaListQuery {
  where: Record<string, unknown>;
  orderBy: Record<string, "asc" | "desc">;
  skip: number;
  take: number;
  meta: PaginationParams;
}

/**
 * Translate parsed list-query params + module options into Prisma
 * `findMany` / `count` arguments. Returns `meta` so callers can pass
 * it straight into `formatListResponse`.
 */
export function buildPrismaListQuery(
  params: ListQueryParams<Record<string, unknown>>,
  opts: BuildPrismaListQueryOptions = {},
): PrismaListQuery {
  const where: Record<string, unknown> = { ...(opts.extraWhere ?? {}) };

  // Module-specific filters — anything outside the pagination
  // skeleton is treated as a where condition.
  const reservedKeys = new Set(["page", "limit", "sortBy", "sortOrder", "search"]);
  for (const [key, value] of Object.entries(params)) {
    if (reservedKeys.has(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    if (opts.filterMap?.[key]) {
      Object.assign(where, opts.filterMap[key]!(value));
    } else {
      where[key] = value;
    }
  }

  // Free-text search → OR contains-insensitive over whitelisted fields.
  if (params.search && opts.searchableFields && opts.searchableFields.length > 0) {
    const or = opts.searchableFields.map((field) => ({
      [field]: ciContains(params.search!),
    }));
    // Preserve any caller-supplied OR (rare; AND-merge by nesting).
    if (where.OR) {
      where.AND = [
        { OR: where.OR },
        { OR: or },
        ...(Array.isArray(where.AND) ? (where.AND as unknown[]) : []),
      ];
      delete where.OR;
    } else {
      where.OR = or;
    }
  }

  const meta: PaginationParams = {
    page: params.page,
    limit: params.limit,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  };

  return {
    where,
    orderBy: { [params.sortBy]: params.sortOrder },
    skip: (params.page - 1) * params.limit,
    take: params.limit,
    meta,
  };
}

// ─── Response helper ───────────────────────────────────────────────────────────

/**
 * Same envelope as `formatPaginatedResponse` — re-exported here so v2
 * modules can keep all list-endpoint pieces (schema, builder,
 * formatter) on one import path.
 */
export const formatListResponse = formatPaginatedResponse;
