// Zod schemas for product and category endpoints

import { z } from "zod";
import { ValidationError } from "../../shared/errors/ValidationError";

/** VARIABLE products always book inventory per variant — callers must supply variantId. */
export function assertVariableProductHasVariant(
  productType: string,
  variantId: string | null | undefined,
  message: string,
): void {
  if (productType === "VARIABLE" && (variantId == null || variantId === "")) {
    throw new ValidationError(message);
  }
}

// ── Variant sub-schema (used inside product create/update) ──────────────────
const variantSchema = z.object({
  name: z.string().min(1).max(100),
  sku: z.string().min(1).max(100),
  barcode: z.string().max(100).optional().nullable(),
  costPrice: z.number().min(0).optional().nullable(),
  sellPrice: z.number().min(0).optional().nullable(),
  isActive: z.boolean().optional(),
});

// ── Create product ──────────────────────────────────────────────────────────
export const createProductSchema = z.object({
  name: z.string().min(1, "Product name is required").max(255),
  sku: z.string().min(1, "SKU is required").max(100),
  barcode: z.string().max(100).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  productType: z.enum(["STANDARD", "VARIABLE", "COMBO", "SERVICE"]).default("STANDARD"),
  costPrice: z.number().min(0, "Cost price must be >= 0"),
  sellPrice: z.number().min(0, "Sell price must be >= 0"),
  taxGroupId: z.string().uuid().optional().nullable(),
  image: z.string().url("Image must be a valid URL").optional().nullable(),
  weight: z.number().min(0).optional().nullable(),
  warrantyMonths: z.number().int().min(0).optional().nullable(),
  expiryDate: z.coerce.date().optional().nullable(),
  variants: z.array(variantSchema).optional(),
  // Pricing Brain (Phase 1.2) — tax treatment + bound levies.
  taxCategory: z.enum(["STANDARD", "ZERO_RATED", "PROVINCIAL_RELIEF", "EXEMPT"]).default("STANDARD"),
  taxInclusive: z.boolean().default(false),
  levyIds: z.array(z.string().uuid()).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

// ── Update product ──────────────────────────────────────────────────────────
export const updateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  sku: z.string().min(1).max(100).optional(),
  barcode: z.string().max(100).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  costPrice: z.number().min(0).optional(),
  sellPrice: z.number().min(0).optional(),
  taxGroupId: z.string().uuid().optional().nullable(),
  image: z.string().url().optional().nullable(),
  weight: z.number().min(0).optional().nullable(),
  warrantyMonths: z.number().int().min(0).optional().nullable(),
  expiryDate: z.coerce.date().optional().nullable(),
  isActive: z.boolean().optional(),
  // Pricing Brain (Phase 1.2) — tax treatment + bound levies. No `.default()`
  // here (unlike create): a PATCH that omits these fields must leave the
  // existing value untouched, not silently reset it to STANDARD/false.
  taxCategory: z.enum(["STANDARD", "ZERO_RATED", "PROVINCIAL_RELIEF", "EXEMPT"]).optional(),
  taxInclusive: z.boolean().optional(),
  levyIds: z.array(z.string().uuid()).optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ── Add / update variant on existing product ────────────────────────────────
export const upsertVariantSchema = variantSchema;
export type UpsertVariantInput = z.infer<typeof upsertVariantSchema>;

// ── Bulk import ─────────────────────────────────────────────────────────────
export const bulkImportSchema = z.object({
  products: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        sku: z.string().min(1).max(100),
        barcode: z.string().max(100).optional().nullable(),
        categoryId: z.string().uuid().optional().nullable(),
        productType: z.enum(["STANDARD", "VARIABLE", "COMBO", "SERVICE"]).default("STANDARD"),
        costPrice: z.number().min(0),
        sellPrice: z.number().min(0),
        taxGroupId: z.string().uuid().optional().nullable(),
      }),
    )
    .min(1, "At least one product is required")
    .max(500, "Maximum 500 products per import"),
});

export type BulkImportInput = z.infer<typeof bulkImportSchema>;

// ── Category: Create ────────────────────────────────────────────────────────
export const createCategorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(255),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

// ── Category: Update ────────────────────────────────────────────────────────
export const updateCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
