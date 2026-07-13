// All query params are parsed with Zod — no `as string` casts anywhere.

import { Request, Response, NextFunction } from "express";
import * as checkoutService from "./checkout.service";
import * as saleService from "./sale.service";
import {
  checkoutSchema,
  listSalesSchema,
  voidSaleSchema,
  returnSaleSchema,
} from "./sale.validation";

// ── POST /api/v1/sales/checkout ────────────────────────────────────────────────

export async function checkout(req: Request, res: Response, next: NextFunction) {
  try {
    const input = checkoutSchema.parse(req.body);
    const sale = await checkoutService.processCheckout(req.db!, req.tenantId!, req.user!.id, input);
    res.status(201).json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/sales ──────────────────────────────────────────────────────────
// req.query is parsed entirely by Zod — no manual `as string` casts

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listSalesSchema.parse(req.query);
    const result = await saleService.listSales(req.db!, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/sales/:id ──────────────────────────────────────────────────────

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const sale = await saleService.getSaleById(req.db!, req.params.id as string);
    res.json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/sales/:id/void ───────────────────────────────────────────────

export async function voidSale(req: Request, res: Response, next: NextFunction) {
  try {
    const input = voidSaleSchema.parse(req.body);
    const sale = await saleService.voidSale(
      req.db!,
      req.tenantId!,
      req.params.id as string,
      req.user!.id,
      input,
    );
    res.json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/sales/:id/return ─────────────────────────────────────────────

export async function returnSale(req: Request, res: Response, next: NextFunction) {
  try {
    const input = returnSaleSchema.parse(req.body);
    const sale = await saleService.returnSale(
      req.db!,
      req.tenantId!,
      req.params.id as string,
      req.user!.id,
      input,
    );
    res.json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
}
