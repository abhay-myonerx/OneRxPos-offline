// Zod schemas for authentication endpoints

import { z } from "zod";

// ── Register — creates Tenant + first Admin user + default Store ────────────
export const registerSchema = z.object({
  // Tenant info
  businessName: z.string().min(2, "Business name must be at least 2 characters").max(255),
  businessEmail: z.string().email("Invalid business email"),
  businessPhone: z.string().max(50).optional(),

  // Admin user info
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one digit",
    ),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ── Login ───────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ── Refresh token ───────────────────────────────────────────────────────────
export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

// ── Change password (authenticated) ────────────────────────────────────────
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one digit",
    ),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
