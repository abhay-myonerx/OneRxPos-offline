// Zod schemas for the Levy module (Phase 1.2 Pricing Brain).
//
// A Levy is a flat/percent surcharge (e.g. an environmental handling
// fee or eco-tax) bound to products via `ProductLevy`. See
// `docs/superpowers/plans/2026-07-05-phase1.2-pricing-brain.md` Task 9.

import { z } from "zod";

import { createListQuerySchema } from "../../shared/utils/listQuery";

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid levy id"),
});
export type LevyIdParam = z.infer<typeof idParamSchema>;

export const listQuerySchema = createListQuerySchema({
  sortable: ["createdAt", "name", "code", "amount"] as const,
  defaultSortBy: "name",
  defaultSortOrder: "asc",
  filters: z.object({
    isActive: z.coerce.boolean().optional(),
    archived: z.enum(["active", "archived", "any"]).optional(),
    mode: z.enum(["FLAT_PER_UNIT", "FLAT_PER_LINE", "PERCENT"]).optional(),
  }),
});
export type ListLevyInput = z.infer<typeof listQuerySchema>;

export const createLevySchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(50),
  name: z.string().trim().min(1, "Name is required").max(100),
  mode: z.enum(["FLAT_PER_UNIT", "FLAT_PER_LINE", "PERCENT"]),
  amount: z.number().nonnegative("Amount must be >= 0"),
  taxable: z.boolean().default(true),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
});
export type CreateLevyInput = z.infer<typeof createLevySchema>;

export const updateLevySchema = createLevySchema.partial();
export type UpdateLevyInput = z.infer<typeof updateLevySchema>;
