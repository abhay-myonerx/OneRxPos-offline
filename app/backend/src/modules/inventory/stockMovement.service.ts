// Audit log queries for stock movements

import { TenantPrismaClient } from "../../config/database";
import type { ListMovementsInput } from "./inventory.validation";

export async function listStockMovements(db: TenantPrismaClient, filters: ListMovementsInput) {
  const where: Record<string, unknown> = {};

  if (filters.storeId) where.storeId = filters.storeId;
  if (filters.productId) where.productId = filters.productId;
  if (filters.variantId) where.variantId = filters.variantId;
  if (filters.type) where.type = filters.type;

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom && { gte: filters.dateFrom }),
      ...(filters.dateTo && { lte: filters.dateTo }),
    };
  }

  const skip = (filters.page - 1) * filters.limit;

  const [data, total] = await Promise.all([
    db.stockMovement.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        store: { select: { id: true, name: true, code: true } },
        variant: { select: { id: true, name: true, sku: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: filters.limit,
    }),
    db.stockMovement.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
      hasMore: filters.page * filters.limit < total,
    },
  };
}
