import { Request, Response, NextFunction } from "express";
import * as purchaseService from "./purchase.service";
import {
  createPurchaseSchema,
  receiveGoodsSchema,
  addPaymentSchema,
  listPurchasesSchema,
} from "./purchase.validation";
import { ValidationError } from "../../shared/errors";
import { enqueue, loadTenantContext } from "../messaging/messaging.service";
import { renderPurchaseOrderHtml } from "./purchase-order.render";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listPurchasesSchema.parse(req.query);
    const result = await purchaseService.listPurchases(req.db!, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const po = await purchaseService.getPurchaseById(req.db!, req.params.id as string);
    res.json({ success: true, data: po });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/purchases/:id/email ───────────────────────────────────────────
// Email a purchase order to its supplier (3H.1 messaging consumer). Recipient
// defaults to the supplier's email; `body.to` overrides. Manual send — the
// auto-reorder trigger is a later slice (3H.2). Durable/async via the outbox.
export async function emailPurchaseOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const po = await purchaseService.getPurchaseById(req.db!, req.params.id as string);

    const to = ((req.body?.to as string) || po.supplier?.email || "").trim();
    if (!to) throw new ValidationError("No recipient email address (supplier has no email)");

    const html = renderPurchaseOrderHtml(po);
    const tenant = await loadTenantContext(req.db!, req.tenantId!);
    const row = await enqueue(req.db!, tenant, {
      tenantId: req.tenantId!,
      storeId: po.storeId,
      kind: "PURCHASE_ORDER",
      to: { email: to, name: po.supplier?.name ?? undefined },
      subject: `Purchase Order ${po.purchaseNo}`,
      html,
      related: { type: "PurchaseOrder", id: po.id },
      createdBy: req.user?.id,
    });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/purchases/reorder-suggestions?storeId= — low-stock products +
// their preferred vendor + suggested qty (3H.2 manual reorder view).
export async function reorderSuggestions(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = (req.query.storeId as string) || undefined;
    const data = await purchaseService.getReorderSuggestions(req.db!, storeId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createPurchaseSchema.parse(req.body);
    const po = await purchaseService.createPurchase(req.db!, req.tenantId!, input);
    res.status(201).json({ success: true, data: po });
  } catch (err) {
    next(err);
  }
}

export async function receiveGoods(req: Request, res: Response, next: NextFunction) {
  try {
    const input = receiveGoodsSchema.parse(req.body);
    const result = await purchaseService.receiveGoods(
      req.db!,
      req.tenantId!,
      req.params.id as string,
      req.user!.id,
      input,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function addPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const input = addPaymentSchema.parse(req.body);
    const result = await purchaseService.addPayment(
      req.db!,
      req.tenantId!,
      req.params.id as string,
      input,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await purchaseService.cancelPurchase(req.db!, req.params.id as string);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
