import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { PERMISSIONS } from "../../shared/types/enums";

import * as ctrl from "./barcode-template.controller";
import {
  createBarcodeTemplateSchema,
  updateBarcodeTemplateSchema,
  barcodeTemplateIdSchema,
} from "./barcode-template.validation";

const router = Router();

// Barcode templates are TENANT-SCOPED: every handler needs the request-scoped
// `TenantPrismaClient` on `req.db`, so this applies `authenticate` +
// `tenantContext` up front (like `sale.routes.ts` / `parked-sale.routes.ts`).
router.use(authenticate, tenantContext);

// ─────────────────────────────────────────────────────────────────────────────
// GET    /api/v1/barcode-templates      — list this tenant's templates (till-readable)
// POST   /api/v1/barcode-templates      — create   (admin-gated: SETTINGS_MANAGE)
// PUT    /api/v1/barcode-templates/:id  — update   (admin-gated: SETTINGS_MANAGE)
// DELETE /api/v1/barcode-templates/:id  — delete   (admin-gated: SETTINGS_MANAGE)
// ─────────────────────────────────────────────────────────────────────────────
//
// Reads are open to any authenticated till user (the decode pipeline fetches
// templates on POS load). Writes are the "learn a label" admin tool (Settings →
// Barcode Labels, admin-gated — spec C6), gated on SETTINGS_MANAGE, which only
// ADMIN/SUPER_ADMIN hold in the role→permission map.

router.get("/", ctrl.list);

router.post(
  "/",
  authorize(PERMISSIONS.SETTINGS_MANAGE),
  validate(createBarcodeTemplateSchema),
  ctrl.create,
);

router.put(
  "/:id",
  authorize(PERMISSIONS.SETTINGS_MANAGE),
  validate(barcodeTemplateIdSchema, "params"),
  validate(updateBarcodeTemplateSchema),
  ctrl.update,
);

router.delete(
  "/:id",
  authorize(PERMISSIONS.SETTINGS_MANAGE),
  validate(barcodeTemplateIdSchema, "params"),
  ctrl.remove,
);

export default router;
