// Phase 2.1 — Drug identity HTTP handlers.
//
// Catalog reads (search / get) hit the GLOBAL `prisma` client — DrugProduct is
// shared reference data, so no tenant scoping (just `authenticate`). The
// product-extension writes use `req.db` (the request-scoped TenantPrismaClient)
// and are admin-gated on the route.

import { Request, Response, NextFunction } from "express";

import { prisma } from "../../config/database";
import * as drugService from "./drug.service";
import type {
  SearchDrugProductsInput,
  DrugDinParamInput,
  ProductIdParamInput,
  LinkProductDrugInput,
  ScheduleOverrideInput,
} from "./drug.validation";

// ── GET /api/v1/drug-products?search=&limit= — search the global catalog ──────
export async function search(req: Request, res: Response, next: NextFunction) {
  try {
    const { search: q, limit } = req.query as unknown as SearchDrugProductsInput;
    const data = await drugService.searchDrugProducts(prisma, { search: q, limit });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/drug-products/:din — one catalog entry ────────────────────────
export async function getByDin(req: Request, res: Response, next: NextFunction) {
  try {
    const { din } = req.params as unknown as DrugDinParamInput;
    const data = await drugService.getDrugProductByDin(prisma, din);
    if (!data) {
      res.status(404).json({ success: false, error: "Drug product not found" });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── PUT /api/v1/products/:id/drug — link / unlink a DIN (admin-gated) ──────────
export async function linkDrug(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as ProductIdParamInput;
    const { din } = req.body as LinkProductDrugInput;
    const data = await drugService.linkProductDrug(req.db!, id, din);
    if (!data) {
      res.status(404).json({ success: false, error: "Product not found" });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── PUT /api/v1/products/:id/schedule-override (admin-gated) ───────────────────
export async function setScheduleOverride(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as ProductIdParamInput;
    const { scheduleOverride } = req.body as ScheduleOverrideInput;
    const data = await drugService.setScheduleOverride(req.db!, id, scheduleOverride);
    if (!data) {
      res.status(404).json({ success: false, error: "Product not found" });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
