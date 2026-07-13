// src/shared/settings/webhooks.ts — Webhooks tenant settings
// (Phase 19c / OI-075).

import { z } from "zod";

export const webhooksSchema = z
  .object({
    enabled: z.boolean().default(false),
    // Defaults applied to new webhook subscriptions; per-webhook
    // overrides live on the Webhook row itself.
    defaultRetryCount: z.number().int().min(0).max(20).default(5),
    defaultRetryBackoffMs: z.number().int().min(0).default(60000),
    signatureAlgo: z.enum(["sha256"]).default("sha256"),
  })
  .strict();

export type WebhooksSettings = z.infer<typeof webhooksSchema>;
