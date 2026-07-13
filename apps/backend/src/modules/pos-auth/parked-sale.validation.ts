import { z } from "zod";

// ── Create / mirror (POST /api/v2/pos/parked-sales) ───────────────────────────
// `id` is CLIENT-supplied (crypto.randomUUID on the till) so the mirror is
// idempotent by the same id the local IndexedDB store used. `snapshot` is an
// opaque serialized cart (grants already stripped client-side) — the backend
// never inspects it, so it is validated only as "some JSON object".
export const createParkedSaleSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  customerId: z.string().nullish(),
  label: z.string().max(120).nullish(),
  parkedByName: z.string().nullish(),
  snapshot: z.record(z.string(), z.unknown()),
  itemCount: z.number().int().min(0),
  total: z.number().min(0),
});

export type CreateParkedSaleInput = z.infer<typeof createParkedSaleSchema>;

// ── List (GET /api/v2/pos/parked-sales?storeId=) query params ─────────────────
export const listParkedSalesSchema = z.object({
  storeId: z.string().min(1),
});

export type ListParkedSalesInput = z.infer<typeof listParkedSalesSchema>;

// ── :id path param (claim / discard) ──────────────────────────────────────────
export const parkedSaleIdSchema = z.object({
  id: z.string().min(1),
});

export type ParkedSaleIdInput = z.infer<typeof parkedSaleIdSchema>;
