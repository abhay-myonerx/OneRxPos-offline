// Phase 2.1 — Drug identity data access.
//
// TWO surfaces with DIFFERENT scoping:
//   • DrugProduct catalog reads (search / getByDin) — GLOBAL reference data, so
//     they use the un-scoped `prisma` client. Any authenticated user may read.
//   • Product-extension writes (link a DIN / set a schedule override) — TENANT
//     data, so they go through the request-scoped `TenantPrismaClient` (`req.db`)
//     which auto-injects tenantId; cross-tenant products read as "not found".

import type { PrismaClient } from "@/generated/prisma/client";
import { ciContains } from "../../shared/utils/ci-match";
import { DrugScheduleCategory } from "@/generated/prisma/enums";
import type { TenantPrismaClient } from "../../config/database";

// Cap on rows scanned in-process for the JSON ingredient-name match (the DB
// handles din/brand directly). Bounds memory for large national catalogs.
const INGREDIENT_SCAN_CAP = 500;
const DEFAULT_LIMIT = 25;

export interface ActiveIngredientDto {
  name: string;
  strength: string | null;
}

export interface DrugProductDto {
  din: string;
  brandName: string;
  company: string | null;
  form: string | null;
  route: string | null;
  activeIngredients: ActiveIngredientDto[];
  scheduleClass: string | null;
  scheduleCategory: DrugScheduleCategory;
  status: string | null;
  npn: string | null;
}

type DrugProductGlobalClient = Pick<PrismaClient, "drugProduct">;

interface DrugProductRecord {
  din: string;
  brandName: string;
  company: string | null;
  form: string | null;
  route: string | null;
  activeIngredients: unknown;
  scheduleClass: string | null;
  scheduleCategory: DrugScheduleCategory;
  status: string | null;
  npn: string | null;
}

const SELECT = {
  din: true,
  brandName: true,
  company: true,
  form: true,
  route: true,
  activeIngredients: true,
  scheduleClass: true,
  scheduleCategory: true,
  status: true,
  npn: true,
} as const;

function toIngredients(raw: unknown): ActiveIngredientDto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      name: typeof x.name === "string" ? x.name : "",
      strength: typeof x.strength === "string" ? x.strength : null,
    }));
}

function toDto(r: DrugProductRecord): DrugProductDto {
  return {
    din: r.din,
    brandName: r.brandName,
    company: r.company,
    form: r.form,
    route: r.route,
    activeIngredients: toIngredients(r.activeIngredients),
    scheduleClass: r.scheduleClass,
    scheduleCategory: r.scheduleCategory,
    status: r.status,
    npn: r.npn,
  };
}

// ── Search the GLOBAL catalog by din / brandName / ingredient name ────────────
export async function searchDrugProducts(
  prisma: DrugProductGlobalClient,
  opts: { search?: string; limit?: number },
): Promise<DrugProductDto[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const q = opts.search?.trim();

  if (!q) {
    const rows = (await prisma.drugProduct.findMany({
      orderBy: { brandName: "asc" },
      take: limit,
      select: SELECT,
    })) as DrugProductRecord[];
    return rows.map(toDto);
  }

  // din / brandName are matched at the DB level (indexed, case-insensitive brand).
  const direct = (await prisma.drugProduct.findMany({
    where: {
      OR: [
        { din: { contains: q } },
        { brandName: ciContains(q) },
      ],
    },
    orderBy: { brandName: "asc" },
    take: limit,
    select: SELECT,
  })) as DrugProductRecord[];

  const byDin = new Map<string, DrugProductRecord>();
  for (const r of direct) byDin.set(r.din, r);

  // Ingredient names live in a JSON array of objects — not directly queryable
  // via Prisma, so scan a bounded page and filter in-process, then merge.
  if (byDin.size < limit) {
    const ql = q.toLowerCase();
    const scan = (await prisma.drugProduct.findMany({
      orderBy: { brandName: "asc" },
      take: INGREDIENT_SCAN_CAP,
      select: SELECT,
    })) as DrugProductRecord[];
    for (const r of scan) {
      if (byDin.has(r.din)) continue;
      const hit = toIngredients(r.activeIngredients).some((i) =>
        i.name.toLowerCase().includes(ql),
      );
      if (hit) byDin.set(r.din, r);
      if (byDin.size >= limit) break;
    }
  }

  return Array.from(byDin.values())
    .slice(0, limit)
    .map(toDto);
}

// ── Get a single catalog entry by DIN ─────────────────────────────────────────
export async function getDrugProductByDin(
  prisma: DrugProductGlobalClient,
  din: string,
): Promise<DrugProductDto | null> {
  const row = (await prisma.drugProduct.findUnique({
    where: { din },
    select: SELECT,
  })) as DrugProductRecord | null;
  return row ? toDto(row) : null;
}

// ── Link / unlink a DIN on a tenant Product (tenant-scoped) ───────────────────
//
// Soft link: a non-null DIN is allowed even if no matching DrugProduct exists
// yet (a tenant may enter a DIN before its DPD row is imported — resolved later
// at read time). Returns null when the product does not belong to this tenant.
export async function linkProductDrug(
  db: TenantPrismaClient,
  productId: string,
  din: string | null,
): Promise<{ id: string; din: string | null } | null> {
  const existing = await db.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!existing) return null;

  const row = await db.product.update({
    where: { id: productId },
    data: { din },
    select: { id: true, din: true },
  });
  return { id: row.id, din: row.din };
}

// ── Set / clear a product's schedule override (tenant-scoped) ─────────────────
export async function setScheduleOverride(
  db: TenantPrismaClient,
  productId: string,
  scheduleOverride: DrugScheduleCategory | null,
): Promise<{ id: string; scheduleOverride: DrugScheduleCategory | null } | null> {
  const existing = await db.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!existing) return null;

  const row = await db.product.update({
    where: { id: productId },
    data: { scheduleOverride },
    select: { id: true, scheduleOverride: true },
  });
  return { id: row.id, scheduleOverride: row.scheduleOverride };
}
