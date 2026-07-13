// Zod schemas for the first-run setup wizard

import { z } from "zod";

// Same fields as register + optional accessCode
export const completeSetupSchema = z.object({
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

  // Required: matches SETUP_ACCESS_CODE configured on the server
  accessCode: z.string().min(1, "Access code is required"),
});

export type CompleteSetupInput = z.infer<typeof completeSetupSchema>;
