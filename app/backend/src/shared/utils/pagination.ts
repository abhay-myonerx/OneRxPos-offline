import { z } from "zod";

// ─── Schema ────────────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function buildPagination(params: PaginationParams) {
  const skip = (params.page - 1) * params.limit;
  return {
    skip,
    take: params.limit,
    orderBy: { [params.sortBy]: params.sortOrder } as Record<string, "asc" | "desc">,
  };
}

export function formatPaginatedResponse<T>(data: T[], total: number, params: PaginationParams) {
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
      hasMore: params.page * params.limit < total,
    },
  };
}
