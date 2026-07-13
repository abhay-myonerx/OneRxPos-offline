import { TenantPrismaClient } from "../../config/database";
import { ciContains } from "../../shared/utils/ci-match";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ValidationError } from "../../shared/errors/ValidationError";
import { InsufficientStockError } from "../../shared/errors/InsufficientStockError";
import { logger } from "../../shared/utils/logger";
import {
  buildPagination,
  formatPaginatedResponse,
  PaginationParams,
} from "../../shared/utils/pagination";
import { setStockAbsolute } from "./stockUpsert";
import type {
  AdjustStockInput,
  SetStockInput,
  UpdateThresholdInput,
  LowStockQuery,
} from "./inventory.validation";
import { assertVariableProductHasVariant } from "../product/product.validation";

// -- List stock levels ------------------------------------------------------

export async function listStockLevels(
  db: TenantPrismaClient,
  filters: {
    storeId?: string;
    productId?: string;
    search?: string;
    belowThreshold?: boolean;
  },
  pagination: PaginationParams,
) {
  const where: Record<string, unknown> = {};

  if (filters.storeId) where.storeId = filters.storeId;
  if (filters.productId) where.productId = filters.productId;

  if (filters.search) {
    where.product = {
      OR: [
        { name: ciContains(filters.search) },
        { sku: ciContains(filters.search) },
        { barcode: ciContains(filters.search) },
      ],
    };
  }

  const [data, total] = await Promise.all([
    db.storeStock.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            costPrice: true,
            sellPrice: true,
            category: { select: { id: true, name: true } },
          },
        },
        store: { select: { id: true, name: true, code: true } },
        variant: { select: { id: true, name: true, sku: true } },
      },
      ...buildPagination({
        ...pagination,
        sortBy: pagination.sortBy === "createdAt" ? "updatedAt" : pagination.sortBy,
      }),
    }),
    db.storeStock.count({ where }),
  ]);

  return formatPaginatedResponse(data, total, pagination);
}

// -- Get single stock record ------------------------------------------------

export async function getStockRecord(
  db: TenantPrismaClient,
  storeId: string,
  productId: string,
  variantId?: string | null,
) {
  return db.storeStock.findFirst({
    where: { storeId, productId, variantId: variantId ?? null },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      store: { select: { id: true, name: true } },
    },
  });
}

// -- Adjust stock (delta) ---------------------------------------------------

export async function adjustStock(
  db: TenantPrismaClient,
  tenantId: string,
  userId: string,
  input: AdjustStockInput,
) {
  const product = await db.product.findUnique({
    where: { id: input.productId },
  });
  if (!product) throw new NotFoundError("Product", input.productId);

  assertVariableProductHasVariant(
    product.productType,
    input.variantId,
    `Stock adjustment for "${product.name}" requires variantId because this product is variable.`,
  );

  if (input.variantId) {
    const variant = await db.productVariant.findFirst({
      where: { id: input.variantId, productId: input.productId },
    });
    if (!variant) throw new NotFoundError("Variant", input.variantId);
  }

  const store = await db.store.findUnique({ where: { id: input.storeId } });
  if (!store) throw new NotFoundError("Store", input.storeId);

  const variantId = input.variantId ?? null;

  const { stockRecord, movement } = await db.$transaction(async (tx) => {
    const existing = await tx.storeStock.findFirst({
      where: {
        storeId: input.storeId,
        productId: input.productId,
        variantId,
      },
      select: { quantity: true },
    });
    const currentQty = existing?.quantity ?? 0;
    const newQty = currentQty + input.quantityChange;

    // Reject if the result would be negative. This applies to ALL movement
    // types — even admin adjustments. If you truly need to "set" stock to
    // a specific number, use setStock(). This prevents the silent-clamp
    // bug where the ledger showed a -100 change but the row stayed at 0.
    if (newQty < 0) {
      if (input.type === "ADJUSTMENT_ADD" || input.type === "ADJUSTMENT_SUB") {
        throw new ValidationError(
          `Adjustment would result in negative stock (current: ${currentQty}, change: ${input.quantityChange}). ` +
            `Use setStock to override to a specific quantity.`,
        );
      }
      throw new InsufficientStockError(input.productId, currentQty, Math.abs(input.quantityChange));
    }

    // Atomic write via the unique constraint + raw INSERT ... ON CONFLICT.
    await setStockAbsolute(tx, input.storeId, input.productId, variantId, newQty);

    const stock = await tx.storeStock.findFirst({
      where: {
        storeId: input.storeId,
        productId: input.productId,
        variantId,
      },
    });

    const mov = await tx.stockMovement.create({
      data: {
        tenantId,
        storeId: input.storeId,
        productId: input.productId,
        variantId,
        type: input.type,
        quantityChange: input.quantityChange,
        quantityAfter: newQty,
        referenceId: input.referenceId ?? null,
        referenceType: input.referenceType ?? null,
        notes: input.notes ?? null,
        performedBy: userId,
      },
    });

    return { stockRecord: stock, movement: mov };
  });

  logger.info(
    {
      tenantId,
      storeId: input.storeId,
      productId: input.productId,
      type: input.type,
      change: input.quantityChange,
    },
    "Stock adjusted",
  );

  return { stockRecord, movement };
}

// -- Set stock (absolute) ---------------------------------------------------

export async function setStock(
  db: TenantPrismaClient,
  tenantId: string,
  userId: string,
  input: SetStockInput,
) {
  if (input.quantity < 0) {
    throw new ValidationError("Stock quantity cannot be negative");
  }

  const product = await db.product.findUnique({
    where: { id: input.productId },
  });
  if (!product) throw new NotFoundError("Product", input.productId);

  assertVariableProductHasVariant(
    product.productType,
    input.variantId,
    `Setting stock for "${product.name}" requires variantId because this product is variable.`,
  );

  const store = await db.store.findUnique({ where: { id: input.storeId } });
  if (!store) throw new NotFoundError("Store", input.storeId);

  const variantId = input.variantId ?? null;

  const { stockRecord, movement } = await db.$transaction(async (tx) => {
    const existing = await tx.storeStock.findFirst({
      where: {
        storeId: input.storeId,
        productId: input.productId,
        variantId,
      },
      select: { quantity: true },
    });
    const currentQty = existing?.quantity ?? 0;
    const delta = input.quantity - currentQty;
    const movType = delta >= 0 ? "ADJUSTMENT_ADD" : "ADJUSTMENT_SUB";

    await setStockAbsolute(tx, input.storeId, input.productId, variantId, input.quantity);

    const stock = await tx.storeStock.findFirst({
      where: {
        storeId: input.storeId,
        productId: input.productId,
        variantId,
      },
    });

    const mov = await tx.stockMovement.create({
      data: {
        tenantId,
        storeId: input.storeId,
        productId: input.productId,
        variantId,
        type: movType,
        quantityChange: delta,
        quantityAfter: input.quantity,
        notes: input.notes ?? "Stock set (absolute override)",
        performedBy: userId,
      },
    });

    return { stockRecord: stock, movement: mov };
  });

  logger.info(
    {
      tenantId,
      productId: input.productId,
      storeId: input.storeId,
      newQty: input.quantity,
    },
    "Stock set (absolute)",
  );

  return { stockRecord, movement };
}

// -- Low-stock items --------------------------------------------------------

export async function getLowStockItems(db: TenantPrismaClient, query: LowStockQuery) {
  const skip = (query.page - 1) * query.limit;

  const where: Record<string, unknown> = { product: { isActive: true } };
  if (query.storeId) where.storeId = query.storeId;

  // NOTE: This still loads all rows then filters in JS — inefficient for
  // tenants with 10k+ SKUs. Phase 2 fix (I3) will rewrite this as raw SQL
  // with `WHERE quantity <= low_stock_threshold` + DB-side pagination.
  const all = await db.storeStock.findMany({
    where,
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          category: { select: { id: true, name: true } },
        },
      },
      store: { select: { id: true, name: true, code: true } },
      variant: { select: { id: true, name: true, sku: true } },
    },
    orderBy: { quantity: "asc" },
  });

  const filtered = all.filter((s) => s.quantity <= s.lowStockThreshold);
  const total = filtered.length;
  const data = filtered.slice(skip, skip + query.limit);

  return {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
      hasMore: query.page * query.limit < total,
    },
  };
}

// -- Update low-stock threshold ---------------------------------------------

export async function updateThreshold(
  db: TenantPrismaClient,
  storeId: string,
  productId: string,
  variantId: string | null | undefined,
  input: UpdateThresholdInput,
) {
  if (input.lowStockThreshold < 0) {
    throw new ValidationError("lowStockThreshold must be >= 0");
  }

  const normalisedVariantId = variantId ?? null;

  const stock = await db.storeStock.findFirst({
    where: { storeId, productId, variantId: normalisedVariantId },
  });

  if (!stock) throw new NotFoundError("Stock record", `${storeId}/${productId}`);

  return db.storeStock.update({
    where: { id: stock.id },
    data: { lowStockThreshold: input.lowStockThreshold },
  });
}
