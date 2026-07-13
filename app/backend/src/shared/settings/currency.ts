// src/shared/settings/currency.ts — Multi-currency tenant settings
// (Phase 19c / OI-075). The Currency / ExchangeRate models stay
// deferred; this namespace records the tenant's base
// currency and the active set so existing UI surfaces have
// something to read.

import { z } from "zod";

export const currencySchema = z
  .object({
    baseCurrency: z.string().length(3).default("BDT"),
    activeCurrencies: z.array(z.string().length(3)).default(["BDT"]),
    // FX freeze policy at checkout — locked spread allowed
    // before rejection (per API Reference §11.1 v2 additive).
    maxRateDeviationPercent: z.number().min(0).max(100).default(1),
  })
  .strict();

export type CurrencySettings = z.infer<typeof currencySchema>;
