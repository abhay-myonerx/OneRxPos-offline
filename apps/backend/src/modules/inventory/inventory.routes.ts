import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { storeGuard } from "../../middleware/storeGuard";
import { PERMISSIONS } from "../../shared/types/enums";
import * as ctrl from "./inventory.controller";

const router = Router();

// All inventory routes require auth + tenant context
router.use(authenticate, tenantContext);

// ─────────────────────────────────────────────────────────────────────────────
// STOCK LEVELS
// GET    /api/v1/inventory/stock                 — paginated stock list
// GET    /api/v1/inventory/stock/low             — items below threshold
// POST   /api/v1/inventory/stock/adjust          — delta adjustment
// POST   /api/v1/inventory/stock/set             — absolute set
// PATCH  /api/v1/inventory/stock/:storeId/:productId/threshold
// ─────────────────────────────────────────────────────────────────────────────

router.get("/stock", authorize(PERMISSIONS.INVENTORY_READ), ctrl.listStock);

router.get("/stock/low", authorize(PERMISSIONS.INVENTORY_READ), ctrl.getLowStock);

router.post("/stock/adjust", authorize(PERMISSIONS.INVENTORY_WRITE), storeGuard, ctrl.adjustStock);

router.post("/stock/set", authorize(PERMISSIONS.INVENTORY_WRITE), storeGuard, ctrl.setStock);

router.patch(
  "/stock/:storeId/:productId/threshold",
  authorize(PERMISSIONS.INVENTORY_WRITE),
  storeGuard,
  ctrl.updateThreshold,
);

// ─────────────────────────────────────────────────────────────────────────────
// STOCK MOVEMENTS (audit log)
// GET    /api/v1/inventory/movements
// ─────────────────────────────────────────────────────────────────────────────

router.get("/movements", authorize(PERMISSIONS.INVENTORY_READ), ctrl.listMovements);

// ─────────────────────────────────────────────────────────────────────────────
// STOCK TRANSFERS
// GET    /api/v1/inventory/transfers
// POST   /api/v1/inventory/transfers
// GET    /api/v1/inventory/transfers/:id
// POST   /api/v1/inventory/transfers/:id/ship       → IN_TRANSIT
// POST   /api/v1/inventory/transfers/:id/receive    → COMPLETED
// POST   /api/v1/inventory/transfers/:id/cancel     → CANCELLED
// ─────────────────────────────────────────────────────────────────────────────

router.get("/transfers", authorize(PERMISSIONS.INVENTORY_READ), ctrl.listTransfers);

router.post("/transfers", authorize(PERMISSIONS.INVENTORY_WRITE), ctrl.createTransfer);

router.get("/transfers/:id", authorize(PERMISSIONS.INVENTORY_READ), ctrl.getTransfer);

router.post("/transfers/:id/ship", authorize(PERMISSIONS.INVENTORY_WRITE), ctrl.shipTransfer);

router.post("/transfers/:id/receive", authorize(PERMISSIONS.INVENTORY_WRITE), ctrl.receiveTransfer);

router.post("/transfers/:id/cancel", authorize(PERMISSIONS.INVENTORY_WRITE), ctrl.cancelTransfer);

export default router;
