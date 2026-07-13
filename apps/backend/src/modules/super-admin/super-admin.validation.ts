import { z } from "zod";

const strongPassword = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128)
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/,
    "Password must contain uppercase, lowercase, digit, and special character",
  );

// ── Create another SUPER_ADMIN ───────────────────────────────────────────────
export const createSuperAdminSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: strongPassword,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

export type CreateSuperAdminInput = z.infer<typeof createSuperAdminSchema>;

// ── Hard delete confirmation ─────────────────────────────────────────────────
export const hardDeleteUserSchema = z.object({
  confirm: z.literal("DELETE").refine((val) => val === "DELETE", {
    message: 'You must send confirm: "DELETE" to hard-delete a user',
  }),
});

export type HardDeleteUserInput = z.infer<typeof hardDeleteUserSchema>;

// ── Bulk user action ─────────────────────────────────────────────────────────
export const bulkUserActionSchema = z.object({
  userIds: z
    .array(z.string().uuid("Invalid user UUID"))
    .min(1, "At least one user ID required")
    .max(100, "Max 100 users per bulk operation"),
  action: z.enum(["ACTIVATE", "DEACTIVATE", "HARD_DELETE"]),
});

export type BulkUserActionInput = z.infer<typeof bulkUserActionSchema>;

// ── Impersonate tenant (get a scoped token) ──────────────────────────────────
export const impersonateTenantSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant UUID"),
});

export type ImpersonateTenantInput = z.infer<typeof impersonateTenantSchema>;

// ── Reset any user password ──────────────────────────────────────────────────
export const resetAnyPasswordSchema = z.object({
  newPassword: strongPassword,
});

export type ResetAnyPasswordInput = z.infer<typeof resetAnyPasswordSchema>;
