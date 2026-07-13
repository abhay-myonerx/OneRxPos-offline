import { Request, Response } from "express";
import * as service from "./payment-terminal.service";
import type { PurchaseInput, RefundInput } from "./payment-terminal.validation";

// A declined/cancelled/timed-out card is a SUCCESSFUL call (200) — the result
// status carries the outcome. Only a terminal error (unreachable) → 502.
export async function purchase(req: Request, res: Response) {
  const { amountCents } = req.body as PurchaseInput;
  try {
    const result = await service.purchase(amountCents);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(502).json({
      success: false,
      error: { message: err instanceof Error ? err.message : "Terminal error" },
    });
  }
}

export async function refund(req: Request, res: Response) {
  const { amountCents, originalTxnId } = req.body as RefundInput;
  try {
    const result = await service.refund(amountCents, originalTxnId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(502).json({
      success: false,
      error: { message: err instanceof Error ? err.message : "Terminal error" },
    });
  }
}

export async function last(_req: Request, res: Response) {
  const result = await service.getLastTransaction();
  res.json({ success: true, data: result });
}

// GET /providers — the supported payment processors + which one is active, for
// the settings UI. Metadata only (no credentials).
export function providers(_req: Request, res: Response) {
  res.json({
    success: true,
    data: { active: service.getActiveProcessor(), providers: service.listProviders() },
  });
}
