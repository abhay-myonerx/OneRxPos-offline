import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { storeGuard } from "../../middleware/storeGuard";
import { validate } from "../../middleware/validate";
import { PERMISSIONS } from "../../shared/types/enums";

import * as ctrl from "./narcotic.controller";
import {
  adjustmentSchema,
  countSchema,
  logQuerySchema,
  productsQuerySchema,
} from "./narcotic.validation";

const router = Router();

// Narcotic log is TENANT-SCOPED: every handler needs the request-scoped
// `TenantPrismaClient` on `req.db` + `req.user.id`, so this applies
// `authenticate` + `tenantContext` up front (like `cashier-shift.routes.ts`).
router.use(authenticate, tenantContext);

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/v1/narcotic/products?storeId=              — narcotic set + on-hand
// GET  /api/v1/narcotic/log?storeId=&productId?&from?&to?  — derived perpetual log
// POST /api/v1/narcotic/count                          — physical-count reconcile
// POST /api/v1/narcotic/adjustment                     — loss/theft/destruction
// ─────────────────────────────────────────────────────────────────────────────
//
// Reads gate on INVENTORY_READ, writes on INVENTORY_WRITE (+ storeGuard) — the
// existing inventory-manage permission (a dedicated PHARMACIST role is a noted
// future item).

router.get(
  "/products",
  authorize(PERMISSIONS.INVENTORY_READ),
  validate(productsQuerySchema, "query"),
  ctrl.products,
);

router.get(
  "/log",
  authorize(PERMISSIONS.INVENTORY_READ),
  validate(logQuerySchema, "query"),
  ctrl.log,
);

router.post(
  "/count",
  authorize(PERMISSIONS.INVENTORY_WRITE),
  validate(countSchema),
  storeGuard,
  ctrl.count,
);

router.post(
  "/adjustment",
  authorize(PERMISSIONS.INVENTORY_WRITE),
  validate(adjustmentSchema),
  storeGuard,
  ctrl.adjustment,
);

export default router;
