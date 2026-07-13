import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";

import * as ctrl from "./cashier-shift.controller";
import {
  openShiftSchema,
  currentShiftQuerySchema,
  cashMovementSchema,
  closeShiftSchema,
  shiftIdSchema,
} from "./cashier-shift.validation";

const router = Router();

// Till sessions are TENANT-SCOPED: every handler needs the request-scoped
// `TenantPrismaClient` on `req.db` + `req.user.id`, so this applies
// `authenticate` + `tenantContext` up front (like `sale.routes.ts` /
// `barcode-template.routes.ts`).
router.use(authenticate, tenantContext);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/cashier-shifts/open                — open a till (float from counts)
// GET  /api/v1/cashier-shifts/current?storeId=    — caller's open shift or null
// POST /api/v1/cashier-shifts/:id/cash-movement   — paid-in / paid-out
// GET  /api/v1/cashier-shifts/:id/summary         — live tally (X-report)
// POST /api/v1/cashier-shifts/:id/close           — count drawer + reconcile (Z)
// ─────────────────────────────────────────────────────────────────────────────
//
// Any authenticated till user opens/closes their OWN shift (there is no admin
// gate — a cashier runs their own drawer); tenant-scoping on `req.db` keeps a
// shift private to its tenant.

router.post("/open", validate(openShiftSchema), ctrl.open);

router.get("/current", validate(currentShiftQuerySchema, "query"), ctrl.current);

router.post(
  "/:id/cash-movement",
  validate(shiftIdSchema, "params"),
  validate(cashMovementSchema),
  ctrl.cashMovement,
);

router.get("/:id/summary", validate(shiftIdSchema, "params"), ctrl.summary);

router.post("/:id/close", validate(shiftIdSchema, "params"), validate(closeShiftSchema), ctrl.close);

export default router;
