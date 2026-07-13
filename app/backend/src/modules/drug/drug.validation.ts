import { z } from "zod";

import { DrugScheduleCategory } from "@/generated/prisma/enums";

// The four normalized schedule categories (shared by the sector attributeSchema
// and the override endpoint).
export const scheduleCategoryEnum = z.enum([
  DrugScheduleCategory.NEEDS_RX,
  DrugScheduleCategory.NARCOTIC,
  DrugScheduleCategory.BEHIND_COUNTER,
  DrugScheduleCategory.OPEN,
]);

// A DIN is Health Canada's 8-digit drug identification number.
const din = z.string().trim().min(1).max(8);

// ── GET /api/v1/drug-products?search=&limit= ──────────────────────────────────
export const searchDrugProductsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type SearchDrugProductsInput = z.infer<typeof searchDrugProductsSchema>;

// ── GET /api/v1/drug-products/:din ────────────────────────────────────────────
export const drugDinParamSchema = z.object({
  din: z.string().trim().min(1).max(8),
});
export type DrugDinParamInput = z.infer<typeof drugDinParamSchema>;

// ── :id path param (product-extension routes) ─────────────────────────────────
export const productIdParamSchema = z.object({
  id: z.string().min(1),
});
export type ProductIdParamInput = z.infer<typeof productIdParamSchema>;

// ── PUT /api/v1/products/:id/drug — link / unlink a DIN (null = unlink) ────────
export const linkProductDrugSchema = z.object({
  din: din.nullable(),
});
export type LinkProductDrugInput = z.infer<typeof linkProductDrugSchema>;

// ── PUT /api/v1/products/:id/schedule-override (null = clear override) ─────────
export const scheduleOverrideSchema = z.object({
  scheduleOverride: scheduleCategoryEnum.nullable(),
});
export type ScheduleOverrideInput = z.infer<typeof scheduleOverrideSchema>;
