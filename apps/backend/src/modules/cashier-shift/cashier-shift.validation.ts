import { z } from "zod";

// ── Denomination counts ───────────────────────────────────────────────────────
// `counts` maps a denomination value (as a string key: "100","50",…,"0.05") to
// a non-negative integer count. Opaque to the backend beyond this shape — the
// pure `countTotal` helper (service) folds it into a dollar total.
const counts = z.record(z.string(), z.number().int().min(0));

// ── Open a till (POST /open) ──────────────────────────────────────────────────
export const openShiftSchema = z.object({
  storeId: z.string().min(1),
  openingCounts: counts,
});

export type OpenShiftInput = z.infer<typeof openShiftSchema>;

// ── Current shift query (GET /current?storeId=) ───────────────────────────────
export const currentShiftQuerySchema = z.object({
  storeId: z.string().min(1),
});

export type CurrentShiftQuery = z.infer<typeof currentShiftQuerySchema>;

// ── Cash movement (POST /:id/cash-movement) ───────────────────────────────────
export const cashMovementSchema = z.object({
  type: z.enum(["PAID_IN", "PAID_OUT"]),
  amount: z.number().positive(),
  reason: z.string().max(500).optional(),
});

export type CashMovementInput = z.infer<typeof cashMovementSchema>;

// ── Close a till (POST /:id/close) ────────────────────────────────────────────
export const closeShiftSchema = z.object({
  closingCounts: counts,
});

export type CloseShiftInput = z.infer<typeof closeShiftSchema>;

// ── :id path param ────────────────────────────────────────────────────────────
export const shiftIdSchema = z.object({
  id: z.string().min(1),
});

export type ShiftIdInput = z.infer<typeof shiftIdSchema>;
