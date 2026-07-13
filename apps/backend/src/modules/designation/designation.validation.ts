// Zod schemas for the HRM Designation module.
import { z } from "zod";

import { createListQuerySchema } from "../../shared/utils/listQuery";

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid designation id"),
});

export const listQuerySchema = createListQuerySchema({
  sortable: ["createdAt", "updatedAt", "title", "code", "level"] as const,
  defaultSortBy: "title",
  defaultSortOrder: "asc",
  filters: z.object({
    isActive: z.coerce.boolean().optional(),
    archived: z.enum(["active", "archived", "any"]).optional(),
    level: z.coerce.number().int().optional(),
  }),
});
export type ListDesignationInput = z.infer<typeof listQuerySchema>;

export const createDesignationSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(40)
    .regex(
      /^[A-Z0-9_-]+$/,
      "Code must be uppercase alphanumeric (hyphens and underscores allowed)",
    ),
  level: z.coerce.number().int().min(1).max(20).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});
export type CreateDesignationInput = z.infer<typeof createDesignationSchema>;

export const updateDesignationSchema = createDesignationSchema.partial();
export type UpdateDesignationInput = z.infer<typeof updateDesignationSchema>;
