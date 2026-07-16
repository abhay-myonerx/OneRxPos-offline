// Zod schemas for authentication endpoints

import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  businessName: z.string().min(2, "Business name must be at least 2 characters").max(255),

  businessEmail: z.string().email("Invalid business email"),

  businessPhone: z.string().max(50).optional(),

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

// ─────────────────────────────────────────────────────────────
// Local Login
// ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),

  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─────────────────────────────────────────────────────────────
// Cloud Login (RXAdmin → Local Auto Login)
// ─────────────────────────────────────────────────────────────

export const cloudLoginSchema = z.object({
  email: z.string().email(),

  password: z.string().min(1),

  firstName: z.string().min(1),

  lastName: z.string().min(1),

  role: z.string().min(1),

  pharmacyId: z.string().min(1),

  pharmacyName: z.string().min(1),
});

export type CloudLoginInput = z.infer<typeof cloudLoginSchema>;

// ─────────────────────────────────────────────────────────────
// Refresh Token
// ─────────────────────────────────────────────────────────────

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

// ─────────────────────────────────────────────────────────────
// Change Password
// ─────────────────────────────────────────────────────────────

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
