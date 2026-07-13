// Product business logic — CRUD, variants, bulk import

import { prisma, TenantPrismaClient } from "../../config/database";
import { ciContains } from "../../shared/utils/ci-match";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ConflictError } from "../../shared/errors/ConflictError";
import { logger } from "../../shared/utils/logger";
import {
  buildPagination,
  formatPaginatedResponse,
  PaginationParams,
} from "../../shared/utils/pagination";
import type {
  CreateProductInput,
  UpdateProductInput,
  UpsertVariantInput,
  BulkImportInput,
} from "./product.validation";

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 240);
}

type PosListStockRow = {
  storeId: string;
  variantId: string | null;
  quantity: number;
  lowStockThreshold: number;
};

/**
 * POS list / barcode payload: VARIABLE drops ambiguous top-level storeStock and
 * attaches rows under each variant; other types only expose product-level rows (variantId null).
 */
function shapeProductStoreStockForPosList<
  T extends {
    productType: string;
    variants: Array<Record<string, unknown> & { id: string }>;
    storeStock?: PosListStockRow[] | false;
  },
>(product: T) {
  if (product.storeStock === false) {
    if (product.productType === "VARIABLE") {
      const { storeStock: _s, ...rest } = product;
      return {
        ...rest,
        variants: product.variants.map((v) => ({
          ...v,
          storeStock: [] as Array<{
            storeId: string;
            variantId: string;
            quantity: number;
            lowStockThreshold: number;
          }>,
        })),
      };
    }
    return product;
  }

  const rows = product.storeStock ?? [];

  if (product.productType === "VARIABLE") {
    const { storeStock: _s, ...rest } = product;
    return {
      ...rest,
      variants: product.variants.map((v) => ({
        ...v,
        storeStock: rows
          .filter((r) => r.variantId === v.id)
          .map((r) => ({
            storeId: r.storeId,
            variantId: r.variantId as string,
            quantity: r.quantity,
            lowStockThreshold: r.lowStockThreshold,
          })),
      })),
    };
  }

  return {
    ...product,
    storeStock: rows
      .filter((r) => r.variantId == null)
      .map((r) => ({
        storeId: r.storeId,
        quantity: r.quantity,
        lowStockThreshold: r.lowStockThreshold,
      })),
  };
}

/** Single-product GET: same rules as list; keeps nested `store` on stock rows where present. */
function shapeProductStoreStockForPosDetail<
  T extends {
    productType: string;
    variants: Array<Record<string, unknown> & { id: string }>;
    storeStock: Array<Record<string, unknown> & { variantId: string | null }>;
  },
>(product: T) {
  const rows = product.storeStock ?? [];

  if (product.productType === "VARIABLE") {
    const { storeStock: _s, ...rest } = product;
    return {
      ...rest,
      variants: product.variants.map((v) => ({
        ...v,
        storeStock: rows.filter((r) => r.variantId === v.id),
      })),
    };
  }

  return {
    ...product,
    storeStock: rows.filter((r) => r.variantId == null),
  };
}

// ── List products ───────────────────────────────────────────────────────────

export async function listProducts(
  db: TenantPrismaClient,
  filters: {
    search?: string;
    categoryId?: string;
    productType?: string;
    isActive?: boolean;
    storeId?: string;
    storeIds?: string[];
  },
  pagination: PaginationParams,
) {
  const where: Record<string, unknown> = {};

  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.productType) where.productType = filters.productType;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;

  if (filters.search) {
    where.OR = [
      { name: ciContains(filters.search) },
      { sku: ciContains(filters.search) },
      { barcode: ciContains(filters.search) },
    ];
  }

  const [data, total] = await Promise.all([
    db.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        // include isInclusive so the POS computes inclusive vs exclusive tax correctly
        taxGroup: { select: { id: true, name: true, rate: true, isInclusive: true } },
        variants: {
          where: { isActive: true },
          select: { id: true, name: true, sku: true, sellPrice: true },
        },
        productLevies: { include: { levy: true } },

        storeStock: filters.storeId
          ? {
              where: { storeId: filters.storeId },
              select: {
                storeId: true,
                variantId: true,
                quantity: true,
                lowStockThreshold: true,
              },
            }
          : filters.storeIds?.length
            ? {
                where: { storeId: { in: filters.storeIds } },
                select: {
                  storeId: true,
                  variantId: true,
                  quantity: true,
                  lowStockThreshold: true,
                },
              }
            : false,
      },
      ...buildPagination(pagination),
    }),
    db.product.count({ where }),
  ]);

  const shaped = data.map((p) => shapeProductStoreStockForPosList(p));
  return formatPaginatedResponse(shaped, total, pagination);
}

// ── Get product by ID ───────────────────────────────────────────────────────

export async function getProductById(db: TenantPrismaClient, productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      taxGroup: { select: { id: true, name: true, rate: true, isInclusive: true } },
      variants: {
        orderBy: { createdAt: "asc" },
      },
      storeStock: {
        include: {
          store: { select: { id: true, name: true, code: true } },
        },
      },
      productLevies: { include: { levy: true } },
    },
  });

  if (!product) throw new NotFoundError("Product", productId);
  return shapeProductStoreStockForPosDetail(product);
}

// ── Lookup product by barcode (exact match) ─────────────────────────────────

export async function lookupByBarcode(db: TenantPrismaClient, barcode: string) {
  // 1. Try exact match on product barcode
  const product = await db.product.findFirst({
    where: { barcode, isActive: true },
    include: {
      category: { select: { id: true, name: true } },
      taxGroup: { select: { id: true, name: true, rate: true, isInclusive: true } },
      variants: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          costPrice: true,
          sellPrice: true,
        },
      },
      storeStock: {
        select: {
          storeId: true,
          variantId: true,
          quantity: true,
          lowStockThreshold: true,
        },
      },
      productLevies: { include: { levy: true } },
    },
  });

  if (product)
    return {
      product: shapeProductStoreStockForPosList(product),
      matchedVariantId: null,
    };

  // 2. Fallback: check variant barcodes
  const variant = await db.productVariant.findFirst({
    where: { barcode, isActive: true },
    include: {
      product: {
        include: {
          category: { select: { id: true, name: true } },
          taxGroup: { select: { id: true, name: true, rate: true, isInclusive: true } },
          variants: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              sku: true,
              barcode: true,
              costPrice: true,
              sellPrice: true,
            },
          },
          storeStock: {
            select: {
              storeId: true,
              variantId: true,
              quantity: true,
              lowStockThreshold: true,
            },
          },
          productLevies: { include: { levy: true } },
        },
      },
    },
  });

  if (variant && variant.product.isActive) {
    return {
      product: shapeProductStoreStockForPosList(variant.product),
      matchedVariantId: variant.id,
    };
  }
  // 3. ✅ NEW — Try SKU (barcode scanner fallback)
  const bySku = await db.product.findFirst({
    where: { sku: barcode, isActive: true },
    include: {
      category: { select: { id: true, name: true } },
      taxGroup: { select: { id: true, name: true, rate: true, isInclusive: true } },
      variants: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          costPrice: true,
          sellPrice: true,
        },
      },
      storeStock: {
        select: {
          storeId: true,
          variantId: true,
          quantity: true,
          lowStockThreshold: true,
        },
      },
      productLevies: { include: { levy: true } },
    },
  });
  if (bySku)
    return {
      product: shapeProductStoreStockForPosList(bySku),
      matchedVariantId: null,
    };

  throw new NotFoundError("Product with barcode", barcode);
}

// ── Create product ──────────────────────────────────────────────────────────

export async function createProduct(
  db: TenantPrismaClient,
  tenantId: string,
  input: CreateProductInput,
) {
  // Check SKU uniqueness (friendlier than P2002)
  const existingSku = await db.product.findFirst({
    where: { sku: input.sku },
  });
  if (existingSku) {
    throw new ConflictError(`A product with SKU "${input.sku}" already exists`);
  }

  // Check barcode uniqueness if provided
  if (input.barcode) {
    const existingBarcode = await db.product.findFirst({
      where: { barcode: input.barcode },
    });
    if (existingBarcode) {
      throw new ConflictError(`A product with barcode "${input.barcode}" already exists`);
    }
  }

  // Validate category
  if (input.categoryId) {
    const cat = await db.category.findUnique({ where: { id: input.categoryId } });
    if (!cat) throw new NotFoundError("Category", input.categoryId);
  }

  // Validate tax group
  if (input.taxGroupId) {
    const tg = await db.taxGroup.findUnique({ where: { id: input.taxGroupId } });
    if (!tg) throw new NotFoundError("Tax group", input.taxGroupId);
  }

  // De-dup before validating/binding — `ProductLevy` has a composite PK of
  // [productId, levyId], so a repeated id in the input would otherwise throw
  // an unhandled P2002 (500) instead of just being a no-op.
  const uniqueLevyIds = input.levyIds !== undefined ? [...new Set(input.levyIds)] : undefined;

  // Validate levy bindings belong to this tenant before creating the product.
  if (uniqueLevyIds?.length) {
    for (const levyId of uniqueLevyIds) {
      const levy = await db.levy.findUnique({ where: { id: levyId } });
      if (!levy) throw new NotFoundError("Levy", levyId);
    }
  }

  // Generate slug
  let slug = slugify(input.name);
  const existingSlug = await db.product.findFirst({ where: { slug } });
  if (existingSlug) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const product = await db.product.create({
    data: {
      tenantId,
      name: input.name,
      slug,
      sku: input.sku,
      barcode: input.barcode ?? null,
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
      productType: input.productType,
      costPrice: input.costPrice,
      sellPrice: input.sellPrice,
      taxGroupId: input.taxGroupId ?? null,
      taxCategory: input.taxCategory,
      taxInclusive: input.taxInclusive,
      image: input.image ?? null,
      weight: input.weight ?? null,
      warrantyMonths: input.warrantyMonths ?? null,
      expiryDate: input.expiryDate ?? null,
      // Create variants inline if provided (VARIABLE type)
      ...(input.variants?.length && {
        variants: {
          create: input.variants.map((v) => ({
            name: v.name,
            sku: v.sku,
            barcode: v.barcode ?? null,
            costPrice: v.costPrice ?? null,
            sellPrice: v.sellPrice ?? null,
            isActive: v.isActive ?? true,
          })),
        },
      }),
      // Bind levies inline if provided
      ...(uniqueLevyIds?.length && {
        productLevies: {
          create: uniqueLevyIds.map((levyId) => ({ levyId })),
        },
      }),
    },
    include: {
      variants: true,
      category: { select: { id: true, name: true } },
      productLevies: { include: { levy: true } },
    },
  });

  logger.info({ tenantId, productId: product.id, sku: product.sku }, "Product created");
  return product;
}

// ── Update product ──────────────────────────────────────────────────────────

export async function updateProduct(
  db: TenantPrismaClient,
  productId: string,
  input: UpdateProductInput,
) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundError("Product", productId);

  // Check SKU conflict if changing
  if (input.sku && input.sku !== product.sku) {
    const conflict = await db.product.findFirst({
      where: { sku: input.sku, id: { not: productId } },
    });
    if (conflict) {
      throw new ConflictError(`A product with SKU "${input.sku}" already exists`);
    }
  }

  // `levyIds` isn't a Product column — it drives the `productLevies` join
  // table separately below, so it must never reach `db.product.update`.
  const { levyIds, ...productFields } = input;

  // De-dup before validating/binding — `ProductLevy` has a composite PK of
  // [productId, levyId], so a repeated id in the input would otherwise throw
  // an unhandled P2002 (500) instead of just being a no-op.
  const uniqueLevyIds = levyIds !== undefined ? [...new Set(levyIds)] : undefined;

  // Validate levy bindings belong to this tenant BEFORE any write — this must
  // stay outside the transaction below so an invalid levyId throws before
  // anything is deleted/created.
  if (uniqueLevyIds !== undefined) {
    for (const levyId of uniqueLevyIds) {
      const levy = await db.levy.findUnique({ where: { id: levyId } });
      if (!levy) throw new NotFoundError("Levy", levyId);
    }
  }

  // Regenerate slug if name changes
  const data: Record<string, unknown> = { ...productFields };
  if (input.name && input.name !== product.name) {
    let slug = slugify(input.name);
    const existing = await db.product.findFirst({
      where: { slug, id: { not: productId } },
    });
    if (existing) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    data.slug = slug;
  }

  // Sync levy bindings (delete-then-recreate the join rows) and update the
  // product row in a single transaction: if the recreate half failed after a
  // separate deleteMany had already committed, the product would be left
  // with ZERO levies — silently under-charging at checkout. All-or-nothing.
  const updated = await db.$transaction(async (tx) => {
    if (uniqueLevyIds !== undefined) {
      await tx.productLevy.deleteMany({ where: { productId } });
      if (uniqueLevyIds.length > 0) {
        await tx.productLevy.createMany({
          data: uniqueLevyIds.map((levyId) => ({ productId, levyId })),
        });
      }
    }

    return tx.product.update({
      where: { id: productId },
      data,
      include: {
        variants: true,
        category: { select: { id: true, name: true } },
        taxGroup: { select: { id: true, name: true, rate: true } },
        productLevies: { include: { levy: true } },
      },
    });
  });

  logger.info({ productId }, "Product updated");
  return updated;
}

// ── Delete product (soft) ───────────────────────────────────────────────────

export async function deleteProduct(db: TenantPrismaClient, productId: string) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundError("Product", productId);

  const updated = await db.product.update({
    where: { id: productId },
    data: { isActive: false },
  });

  logger.info({ productId }, "Product deactivated");
  return updated;
}

// ── Variant CRUD ────────────────────────────────────────────────────────────

export async function addVariant(
  db: TenantPrismaClient,
  productId: string,
  input: UpsertVariantInput,
) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundError("Product", productId);

  const variant = await db.productVariant.create({
    data: {
      productId,
      name: input.name,
      sku: input.sku,
      barcode: input.barcode ?? null,
      costPrice: input.costPrice ?? null,
      sellPrice: input.sellPrice ?? null,
      isActive: input.isActive ?? true,
    },
  });

  logger.info({ productId, variantId: variant.id }, "Variant added");
  return variant;
}

export async function updateVariant(
  db: TenantPrismaClient,
  productId: string,
  variantId: string,
  input: UpsertVariantInput,
) {
  const variant = await db.productVariant.findFirst({
    where: { id: variantId, productId },
  });
  if (!variant) throw new NotFoundError("Variant", variantId);

  const updated = await db.productVariant.update({
    where: { id: variantId },
    data: {
      name: input.name,
      sku: input.sku,
      barcode: input.barcode ?? null,
      costPrice: input.costPrice ?? null,
      sellPrice: input.sellPrice ?? null,
      isActive: input.isActive ?? variant.isActive,
    },
  });

  logger.info({ productId, variantId }, "Variant updated");
  return updated;
}

export async function deleteVariant(db: TenantPrismaClient, productId: string, variantId: string) {
  const variant = await db.productVariant.findFirst({
    where: { id: variantId, productId },
  });
  if (!variant) throw new NotFoundError("Variant", variantId);

  await db.productVariant.update({
    where: { id: variantId },
    data: { isActive: false },
  });

  logger.info({ productId, variantId }, "Variant deactivated");
  return { success: true };
}

// ── Bulk import ─────────────────────────────────────────────────────────────

export async function bulkImport(tenantId: string, input: BulkImportInput) {
  const results = { created: 0, skipped: 0, errors: [] as string[] };

  await prisma.$transaction(async (tx) => {
    for (const item of input.products) {
      // Skip if SKU already exists
      const existing = await tx.product.findFirst({
        where: { tenantId, sku: item.sku },
      });

      if (existing) {
        results.skipped++;
        results.errors.push(`SKU "${item.sku}" already exists — skipped`);
        continue;
      }

      let slug = slugify(item.name);
      const slugConflict = await tx.product.findFirst({
        where: { tenantId, slug },
      });
      if (slugConflict) {
        slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      }

      await tx.product.create({
        data: {
          tenantId,
          name: item.name,
          slug,
          sku: item.sku,
          barcode: item.barcode ?? null,
          categoryId: item.categoryId ?? null,
          productType: item.productType,
          costPrice: item.costPrice,
          sellPrice: item.sellPrice,
          taxGroupId: item.taxGroupId ?? null,
        },
      });

      results.created++;
    }
  });

  logger.info(
    { tenantId, created: results.created, skipped: results.skipped },
    "Bulk import completed",
  );

  return results;
}
