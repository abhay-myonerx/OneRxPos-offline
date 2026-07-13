// Phase 2.4 — narcotic-log HTTP handlers.
//
// Tenant-scoped (the router applies `authenticate` + `tenantContext`, so
// `req.db` is the request-scoped `TenantPrismaClient`, `req.tenantId` is set,
// `req.user.id` is the caller). Query/body shapes are validated by the
// `validate(...)` middleware, so parsed shapes are cast here (mirrors
// `cashier-shift.controller.ts`).

import { Request, Response, NextFunction } from "express";

import * as service from "./narcotic.service";
import type {
  AdjustmentInput,
  CountInput,
  LogQuery,
  ProductsQuery,
} from "./narcotic.validation";

// ── GET /api/v1/narcotic/products?storeId= ────────────────────────────────────
export async function products(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId } = req.query as unknown as ProductsQuery;
    const data = await service.getProducts(req.db!, storeId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/narcotic/log?storeId=&productId?&from?&to? ─────────────────────
export async function log(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as unknown as LogQuery;
    const data = await service.getLog(req.db!, query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/narcotic/count ───────────────────────────────────────────────
export async function count(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.body as CountInput;
    const data = await service.recordCount(req.db!, req.tenantId!, req.user!.id, input);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/narcotic/adjustment ──────────────────────────────────────────
export async function adjustment(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.body as AdjustmentInput;
    const data = await service.recordAdjustment(req.db!, req.tenantId!, req.user!.id, input);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
