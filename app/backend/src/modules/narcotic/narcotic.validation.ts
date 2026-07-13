import { z } from "zod";

// ── GET /narcotic/products?storeId= ───────────────────────────────────────────
export const productsQuerySchema = z.object({
  storeId: z.string().min(1),
});

export type ProductsQuery = z.infer<typeof productsQuerySchema>;

// ── GET /narcotic/log?storeId=&productId?&from?&to? ───────────────────────────
export const logQuerySchema = z.object({
  storeId: z.string().min(1),
  productId: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type LogQuery = z.infer<typeof logQuerySchema>;

// ── POST /narcotic/count ──────────────────────────────────────────────────────
// Observation-only reconciliation: record a counted quantity vs on-hand.
export const countSchema = z.object({
  storeId: z.string().min(1),
  productId: z.string().min(1),
  shiftId: z.string().min(1).optional(),
  countedQty: z.number().int().min(0),
  witnessUserId: z.string().min(1).optional(),
  notes: z.string().max(1000).optional(),
});

export type CountInput = z.infer<typeof countSchema>;

// ── POST /narcotic/adjustment ─────────────────────────────────────────────────
// Stock-reducing loss / theft / destruction event.
export const adjustmentSchema = z.object({
  storeId: z.string().min(1),
  productId: z.string().min(1),
  eventType: z.enum(["LOSS", "THEFT", "DESTRUCTION"]),
  quantity: z.number().int().positive(),
  witnessUserId: z.string().min(1).optional(),
  notes: z.string().max(1000).optional(),
});

export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
