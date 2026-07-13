// Receipt template management + receipt generation endpoints

import { Request, Response, NextFunction } from "express";
import * as receiptService from "./receipt.service";
import { upsertReceiptTemplateSchema, generateReceiptSchema } from "./receipt.validation";
import { ValidationError } from "../../shared/errors";
import { enqueue, loadTenantContext } from "../messaging/messaging.service";

// ── POST /api/v1/receipts/sale/:saleId/print ───────────────────────────────────
// Build the sale's ESC/POS receipt and send it to the store's network printer.
// A missing printer is a SOFT outcome (200 { ok:false }) so auto-print never
// fails the sale; an unreachable printer is a hard 502.
export async function printReceipt(req: Request, res: Response) {
  try {
    const deviceId = (req.body?.deviceId as string) || undefined;
    const result = await receiptService.printSaleReceipt(
      req.db!,
      req.tenantId!,
      req.params.saleId as string,
      deviceId,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(502).json({
      success: false,
      error: { message: err instanceof Error ? err.message : "Receipt print failed" },
    });
  }
}

// ── POST /api/v1/receipts/sale/:saleId/email ───────────────────────────────────
// Email a sale's receipt to the customer (3H.1 messaging consumer). Recipient
// defaults to the sale's customer email; `body.to` overrides it. Missing an
// address is a 400 (the operator asked to send to someone specific). The send
// itself is durable/async via the messaging outbox — this returns the queued row.
export async function emailReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    const saleId = req.params.saleId as string;
    const sale = await req.db!.sale.findUnique({
      where: { id: saleId },
      select: { id: true, storeId: true, customer: { select: { email: true, name: true } } },
    });
    if (!sale) throw new ValidationError(`Sale '${saleId}' not found`);

    const to = ((req.body?.to as string) || sale.customer?.email || "").trim();
    if (!to) throw new ValidationError("No recipient email address (sale has no customer email)");

    const html = (await receiptService.generateReceipt(req.db!, req.tenantId!, saleId, {
      format: "html",
      duplicate: false,
    })) as string;

    const tenant = await loadTenantContext(req.db!, req.tenantId!);
    const row = await enqueue(req.db!, tenant, {
      tenantId: req.tenantId!,
      storeId: sale.storeId,
      kind: "RECEIPT",
      to: { email: to, name: sale.customer?.name ?? undefined },
      subject: `Your receipt`,
      html,
      related: { type: "Sale", id: saleId },
      createdBy: req.user?.id,
    });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/receipts/template ──────────────────────────────────────────────
// Returns the current receipt template for the tenant

export async function getTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const template = await receiptService.getReceiptTemplate(req.db!);
    res.json({ success: true, data: template });
  } catch (err) {
    next(err);
  }
}

// ── PUT /api/v1/receipts/template ──────────────────────────────────────────────
// Create or update the receipt template (one per tenant)

export async function upsertTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const input = upsertReceiptTemplateSchema.parse(req.body);
    const template = await receiptService.upsertReceiptTemplate(req.db!, req.tenantId!, input);
    res.json({ success: true, data: template });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/receipts/sale/:saleId ──────────────────────────────────────────
// Generate a receipt for a specific sale
//
// Query params:
//   format=data|html|thermal  (default: data)
//   duplicate=true|false      (default: false)

export async function generateReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    const options = generateReceiptSchema.parse(req.query);
    const result = await receiptService.generateReceipt(
      req.db!,
      req.tenantId!,
      req.params.saleId as string,
      options,
    );

    // HTML format returns a full page
    if (options.format === "html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(result);
      return;
    }

    // Thermal format returns plain text
    if (options.format === "thermal") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(result);
      return;
    }

    // Default: JSON data
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/receipts/sale/:saleId/preview ──────────────────────────────────
// Same as generate but always returns HTML for iframe/popup preview

export async function previewReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await receiptService.generateReceipt(
      req.db!,
      req.tenantId!,
      req.params.saleId as string,
      { format: "html", duplicate: false },
    );

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(result);
  } catch (err) {
    next(err);
  }
}
