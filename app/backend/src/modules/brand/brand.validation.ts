// Zod schemas for the Catalog Brand module.

import { z } from "zod";

import { createListQuerySchema } from "../../shared/utils/listQuery";

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid brand id"),
});
export type BrandIdParam = z.infer<typeof idParamSchema>;

export const listQuerySchema = createListQuerySchema({
  sortable: ["createdAt", "updatedAt", "name", "slug"] as const,
  defaultSortBy: "name",
  defaultSortOrder: "asc",
  filters: z.object({
    isActive: z.coerce.boolean().optional(),
    archived: z.enum(["active", "archived", "any"]).optional(),
  }),
});
export type ListBrandInput = z.infer<typeof listQuerySchema>;

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createBrandSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(140)
    .regex(slugRegex, "Slug must be lowercase letters, digits, and single hyphens")
    .optional(),
  description: z.string().max(2000).optional().nullable(),
  logo: z.string().url("Logo must be a valid URL").max(2048).optional().nullable(),
  website: z.string().url("Website must be a valid URL").max(255).optional().nullable(),
});
export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export const updateBrandSchema = createBrandSchema.partial();
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

/**
 * Lowercase + ASCII + hyphen-only slug derived from a name. Public so
 * controllers and tests can share it.
 */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}
