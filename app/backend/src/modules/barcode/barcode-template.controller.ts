// BarcodeTemplate (learned label templates) HTTP handlers — Phase 1.3c.
//
// Tenant-scoped (the sub-router applies `authenticate` + `tenantContext`, so
// `req.db` is the request-scoped `TenantPrismaClient` and `req.user` is set).
// Bodies/params are validated by the `validate(...)` middleware on the routes,
// so the parsed shapes are cast here (mirrors `parked-sale.controller.ts`).

import { Request, Response, NextFunction } from "express";

import * as barcodeTemplateService from "./barcode-template.service";
import type {
  CreateBarcodeTemplateInput,
  UpdateBarcodeTemplateInput,
  BarcodeTemplateIdInput,
} from "./barcode-template.validation";

// ── GET /api/v1/barcode-templates — list this tenant's templates ──────────────
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await barcodeTemplateService.listBarcodeTemplates(req.db!);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/v1/barcode-templates — create (admin-gated) ─────────────────────
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.body as CreateBarcodeTemplateInput;
    const data = await barcodeTemplateService.createBarcodeTemplate(
      req.db!,
      req.tenantId!,
      input,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── PUT /api/v1/barcode-templates/:id — update (admin-gated) ──────────────────
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as BarcodeTemplateIdInput;
    const input = req.body as UpdateBarcodeTemplateInput;
    const data = await barcodeTemplateService.updateBarcodeTemplate(req.db!, id, input);

    if (!data) {
      res.status(404).json({ success: false, error: "Barcode template not found" });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /api/v1/barcode-templates/:id — hard delete (admin-gated) ──────────
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as BarcodeTemplateIdInput;
    await barcodeTemplateService.deleteBarcodeTemplate(req.db!, id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
