import { z } from "zod";

export const addVendorSchema = z.object({
  supplierId: z.string().uuid("Invalid supplier UUID"),
  costPrice: z.number().min(0, "Cost must be >= 0"),
  supplierSku: z.string().max(100).optional().nullable(),
  leadTimeDays: z.number().int().min(0).optional().nullable(),
  minOrderQty: z.number().int().min(1).optional().nullable(),
  reorderQty: z.number().int().min(1).optional().nullable(),
  isPreferred: z.boolean().optional(),
  autoEmail: z.boolean().optional().nullable(),
});
export type AddVendorBody = z.infer<typeof addVendorSchema>;

export const updateVendorSchema = addVendorSchema.partial().omit({ supplierId: true });

export const vendorParamsSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
});

export const productIdOnlyParamsSchema = z.object({ id: z.string().uuid() });
