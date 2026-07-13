// src/shared/settings/billing.ts — Subscription billing tenant
// settings. Per OI-014 — billing tables are
// conditional, so we keep settings minimal here.

import { z } from "zod";

export const billingSchema = z
  .object({
    provider: z.enum(["none", "stripe"]).default("none"),
    // Active subscription pointer. Real lifecycle lives in the
    // (deferred) Subscription table; this is the lightweight
    // tenant-side snapshot used by the dashboard widget.
    currentPlanId: z.string().nullable().default(null),
    trialEndsAt: z.string().datetime().nullable().default(null),
  })
  .strict();

export type BillingSettings = z.infer<typeof billingSchema>;
