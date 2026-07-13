// Zod schemas for the HRM Department module.
import { z } from "zod";

import { createListQuerySchema } from "../../shared/utils/listQuery";

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid department id"),
});

export const listQuerySchema = createListQuerySchema({
  sortable: ["createdAt", "updatedAt", "name", "code"] as const,
  defaultSortBy: "name",
  defaultSortOrder: "asc",
  filters: z.object({
    isActive: z.coerce.boolean().optional(),
    archived: z.enum(["active", "archived", "any"]).optional(),
  }),
});
export type ListDepartmentInput = z.infer<typeof listQuerySchema>;

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(40)
    .regex(
      /^[A-Z0-9_-]+$/,
      "Code must be uppercase alphanumeric (hyphens and underscores allowed)",
    ),
  description: z.string().max(2000).optional().nullable(),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = createDepartmentSchema.partial();
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
