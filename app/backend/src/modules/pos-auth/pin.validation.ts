import { z } from "zod";

export const setPinSchema = z.object({
  pin: z.string(),
});

export type SetPinInput = z.infer<typeof setPinSchema>;

export const pinLoginSchema = z.object({
  deviceFingerprint: z.string().min(1),
  userId: z.string().min(1),
  pin: z.string(),
});

export type PinLoginRequest = z.infer<typeof pinLoginSchema>;
