// CashierShift till-session HTTP handlers — Phase 1.4.
//
// Tenant-scoped (the sub-router applies `authenticate` + `tenantContext`, so
// `req.db` is the request-scoped `TenantPrismaClient`, `req.tenantId` is set,
// and `req.user.id` is the caller). Bodies/params/query are validated by the
// `validate(...)` middleware on the routes, so the parsed shapes are cast here
// (mirrors `barcode-template.controller.ts`).

import { Request, Response, NextFunction } from "express";

import * as service from "./cashier-shift.service";
import type {
  OpenShiftInput,
  CurrentShiftQuery,
  CashMovementInput,
  CloseShiftInput,
  ShiftIdInput,
} from "./cashier-shift.validation";

// ── POST /api/v1/cashier-shifts/open — open a till ────────────────────────────
export async function open(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.body as OpenShiftInput;
    const data = await service.openShift(req.db!, req.tenantId!, req.user!.id, input);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/cashier-shifts/current?storeId= — caller's open shift or null ─
export async function current(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId } = req.query as unknown as CurrentShiftQuery;
    const data = await service.getCurrentShift(req.db!, req.user!.id, storeId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/cashier-shifts/:id/cash-movement — paid-in / paid-out ────────
export async function cashMovement(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as ShiftIdInput;
    const input = req.body as CashMovementInput;
    const data = await service.recordCashMovement(req.db!, req.tenantId!, req.user!.id, id, input);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/cashier-shifts/:id/summary — live tally ───────────────────────
export async function summary(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as ShiftIdInput;
    const data = await service.getSummary(req.db!, id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/cashier-shifts/:id/close — count drawer + reconcile ──────────
export async function close(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as ShiftIdInput;
    const input = req.body as CloseShiftInput;
    const data = await service.closeShift(req.db!, id, input);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
