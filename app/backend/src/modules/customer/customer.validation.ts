import { z } from "zod";

// ── Create customer ─────────────────────────────────────────────────────────
export const createCustomerSchema = z.object({
  name: z.string().min(1, "Customer name is required").max(255),
  email: z.string().email("Invalid email").optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(1000).optional().nullable(),
  taxId: z.string().max(100).optional().nullable(),
  groupId: z.string().uuid("Invalid group UUID").optional().nullable(),
  creditLimit: z.number().min(0).default(0),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

// ── Update customer ─────────────────────────────────────────────────────────
export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(1000).optional().nullable(),
  taxId: z.string().max(100).optional().nullable(),
  groupId: z.string().uuid().optional().nullable(),
  creditLimit: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// ── List customers query params ─────────────────────────────────────────────
export const listCustomersSchema = z.object({
  search: z.string().optional(),
  groupId: z.string().uuid().optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  hasDue: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "name", "currentBalance", "loyaltyPoints"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListCustomersInput = z.infer<typeof listCustomersSchema>;

// ── Customer groups ─────────────────────────────────────────────────────────
export const createGroupSchema = z.object({
  name: z.string().min(1, "Group name is required").max(100),
  discountPercent: z.number().min(0).max(100).default(0),
  pricingTier: z.string().max(50).optional().nullable(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  pricingTier: z.string().max(50).optional().nullable(),
});

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

// ── Loyalty ─────────────────────────────────────────────────────────────────
export const adjustPointsSchema = z.object({
  points: z
    .number()
    .int()
    .refine((n) => n !== 0, { message: "Points cannot be zero" }),
  notes: z.string().max(500).optional().nullable(),
});

export type AdjustPointsInput = z.infer<typeof adjustPointsSchema>;
