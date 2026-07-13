// 3H.3 catalog import — request + per-row validation. Row schemas are lenient
// (coerce numbers) and used via `.safeParse` in the service so each row's issues
// become per-row messages rather than a thrown request error.

import { z } from "zod";

export const MAX_IMPORT_ROWS = 5000;

// A mapped product row (values are strings/unknowns off the spreadsheet).
export const productRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  sku: z.string().trim().min(1, "SKU is required").max(100),
  barcode: z.string().trim().max(100).optional().nullable(),
  category: z.string().trim().max(255).optional().nullable(),
  brand: z.string().trim().max(120).optional().nullable(),
  productType: z.enum(["STANDARD", "VARIABLE", "COMBO", "SERVICE"]).default("STANDARD"),
  costPrice: z.coerce.number().min(0, "Cost must be >= 0"),
  sellPrice: z.coerce.number().min(0, "Sell price must be >= 0"),
  taxCategory: z.enum(["STANDARD", "ZERO_RATED", "PROVINCIAL_RELIEF", "EXEMPT"]).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
});
export type ProductRow = z.infer<typeof productRowSchema>;

// A mapped vendor price-list row.
export const vendorRowSchema = z
  .object({
    sku: z.string().trim().max(100).optional().nullable(),
    barcode: z.string().trim().max(100).optional().nullable(),
    costPrice: z.coerce.number().min(0, "Cost must be >= 0"),
    supplierSku: z.string().trim().max(100).optional().nullable(),
    leadTimeDays: z.coerce.number().int().min(0).optional().nullable(),
    minOrderQty: z.coerce.number().int().min(1).optional().nullable(),
    reorderQty: z.coerce.number().int().min(1).optional().nullable(),
  })
  .refine((r) => !!(r.sku || r.barcode), { message: "A SKU or barcode is required to match a product" });
export type VendorRow = z.infer<typeof vendorRowSchema>;

export const importOptionsSchema = z
  .object({
    updateExisting: z.boolean().optional(),
    createMissingCategories: z.boolean().optional(),
    createMissingBrands: z.boolean().optional(),
    onError: z.enum(["skip", "abort"]).optional(),
    supplierId: z.string().uuid().optional(),
  })
  .strict();

export const importRequestSchema = z.object({
  mode: z.enum(["PRODUCTS", "VENDOR_PRICELIST"]),
  rows: z.array(z.record(z.string(), z.unknown())).min(1, "At least one row is required").max(MAX_IMPORT_ROWS, `Maximum ${MAX_IMPORT_ROWS} rows per import`),
  options: importOptionsSchema.optional(),
  dryRun: z.boolean().optional(),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;
