// src/shared/settings/kds.ts — KDS / Customer Display tenant settings
// (Phase 19c / OI-075).

import { z } from "zod";

export const kdsSchema = z
  .object({
    enabled: z.boolean().default(false),
    // Stations the operator has configured. Each represents a
    // logical kitchen routing destination (e.g. "grill", "fry").
    stations: z.array(z.string().min(1).max(80)).default([]),
    // Auto-bump completed orders off the display after N minutes.
    autoBumpMinutes: z.number().int().min(0).max(120).default(0),
  })
  .strict();

export type KdsSettings = z.infer<typeof kdsSchema>;
