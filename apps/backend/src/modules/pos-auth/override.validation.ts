import { z } from "zod";

export const requestOverrideSchema = z.object({
  action: z.string().min(1),
  authorizerUserId: z.string().min(1),
  pin: z.string(),
  deviceFingerprint: z.string().min(1),
  context: z.string().min(1),
});

export type RequestOverrideInput = z.infer<typeof requestOverrideSchema>;

export const consumeOverrideSchema = z.object({
  action: z.string().min(1),
  context: z.string().min(1),
  grant: z.string().min(1),
});

export type ConsumeOverrideInput = z.infer<typeof consumeOverrideSchema>;
