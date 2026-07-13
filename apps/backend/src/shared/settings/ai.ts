// src/shared/settings/ai.ts — AI Insights tenant settings
// (Phase 19c / OI-075). Per API Reference §6.3.

import { z } from "zod";

export const aiSchema = z
  .object({
    enabled: z.boolean().default(false),
    provider: z.enum(["anthropic"]).default("anthropic"),
    byoApiKey: z.boolean().default(true),
    // Operator-supplied Anthropic API key, encrypted at rest
    // via `src/lib/encryption.ts`.
    apiKeyEnc: z.string().nullable().default(null),
    model: z.string().default("claude-opus-4-7"),
    monthlyQueryLimit: z.number().int().min(0).default(1000),
  })
  .strict();

export type AiSettings = z.infer<typeof aiSchema>;
