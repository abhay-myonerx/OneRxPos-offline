// src/shared/settings/reorder.ts — 3H.2 auto-reorder tenant settings.
//
// Both toggles default OFF so the auto-reorder feature is inert until a store
// explicitly opts in (no surprise POs / emails). `autoReorderEnabled` gates
// drafting a PO on low stock; `autoEmailReorder` additionally emails the drafted
// PO to the preferred vendor (via the 3H.1 messaging layer). A per-vendor
// `ProductSupplier.autoEmail` can override the email toggle.

import { z } from "zod";

export const reorderSchema = z
  .object({
    autoReorderEnabled: z.boolean().default(false),
    autoEmailReorder: z.boolean().default(false),
  })
  .strict();

export type ReorderSettings = z.infer<typeof reorderSchema>;
