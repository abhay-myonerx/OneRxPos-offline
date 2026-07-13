import { z } from "zod";

export const enrollSchema = z.object({
  storeId: z.string(),
  fingerprint: z.string().min(16),
  name: z.string().optional(),
});

export type EnrollInput = z.infer<typeof enrollSchema>;
