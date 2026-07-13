// Parked-sale (suspend/resume) HTTP handlers — Phase 1.3b.
//
// Tenant-scoped (the sub-router applies `authenticate` + `tenantContext`, so
// `req.db` is the request-scoped `TenantPrismaClient` and `req.user` is set).
// Bodies/queries/params are validated by the `validate(...)` middleware on the
// routes, so the parsed shapes are cast here (mirrors `sale.controller.ts`).

import { Request, Response, NextFunction } from "express";

import * as parkedSaleService from "./parked-sale.service";
import type {
  CreateParkedSaleInput,
  ListParkedSalesInput,
  ParkedSaleIdInput,
} from "./parked-sale.validation";

// ── POST /api/v2/pos/parked-sales — mirror/create (idempotent) ────────────────
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.body as CreateParkedSaleInput;
    const data = await parkedSaleService.mirrorParkedSale(
      req.db!,
      req.tenantId!,
      req.user!.id,
      input,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v2/pos/parked-sales?storeId= — list PARKED holds for the store ────
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId } = req.query as unknown as ListParkedSalesInput;
    const data = await parkedSaleService.listParkedSales(req.db!, storeId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v2/pos/parked-sales/:id/claim — atomic single-claim ─────────────
export async function claim(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as ParkedSaleIdInput;
    const result = await parkedSaleService.claimParkedSale(req.db!, id, req.user!.id);

    if (!result) {
      res.status(409).json({ success: false, error: "Parked sale already claimed or not found" });
      return;
    }

    res.json({ success: true, data: { snapshot: result.snapshot } });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /api/v2/pos/parked-sales/:id — discard (idempotent) ────────────────
export async function discard(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as ParkedSaleIdInput;
    await parkedSaleService.discardParkedSale(req.db!, id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
