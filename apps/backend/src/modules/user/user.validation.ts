// Zod schemas for user endpoints

import { z } from "zod";

// ── Create user (invite) ────────────────────────────────────────────────────
export const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain uppercase, lowercase, and a digit",
    ),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  phone: z.string().max(50).optional().nullable(),
  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]),
  storeId: z.string().uuid("Invalid store UUID").optional().nullable(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// ── Update own profile (self-service) — NEW ──────────────────────────────────
export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(50).optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ── Update user ─────────────────────────────────────────────────────────────
export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(50).optional().nullable(),
  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]).optional(),
  storeId: z.string().uuid("Invalid store UUID").optional().nullable(),
  isActive: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ── Reset password (admin resets for a user) ────────────────────────────────
export const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain uppercase, lowercase, and a digit",
    ),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ── List filters (query params) ─────────────────────────────────────────────
export const userListQuerySchema = z.object({
  search: z.string().optional(),
  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]).optional(),
  storeId: z.string().uuid().optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;
