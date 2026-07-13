import { z } from "zod";

// ── Shared field constraints ──────────────────────────────────────────────────
// `matchType` / `strategy` are closed enums (the decode pipeline dispatches on
// them). `config` is OPAQUE to the backend — it carries the field carving spec
// (`{ fields: [...], priceDecimals?, taxCategory? }`) that only the frontend
// decode engine interprets — so it is validated shape-only as "some JSON object".
const matchType = z.enum(["prefix", "regex", "length"]);
const strategy = z.enum(["delimited", "fixed", "regex"]);
const config = z.record(z.string(), z.unknown());

// ── Create (POST /api/v1/barcode-templates) ───────────────────────────────────
export const createBarcodeTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  matchType,
  matchValue: z.string().min(1).max(255),
  strategy,
  config,
  isActive: z.boolean().optional(),
});

export type CreateBarcodeTemplateInput = z.infer<typeof createBarcodeTemplateSchema>;

// ── Update (PUT /api/v1/barcode-templates/:id) — all fields optional ──────────
export const updateBarcodeTemplateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  matchType: matchType.optional(),
  matchValue: z.string().min(1).max(255).optional(),
  strategy: strategy.optional(),
  config: config.optional(),
  isActive: z.boolean().optional(),
});

export type UpdateBarcodeTemplateInput = z.infer<typeof updateBarcodeTemplateSchema>;

// ── :id path param (update / delete) ──────────────────────────────────────────
export const barcodeTemplateIdSchema = z.object({
  id: z.string().min(1),
});

export type BarcodeTemplateIdInput = z.infer<typeof barcodeTemplateIdSchema>;
