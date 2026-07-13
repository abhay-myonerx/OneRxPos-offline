import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { storeGuard } from "../../middleware/storeGuard";
import { PERMISSIONS } from "../../shared/types/enums";
import * as ctrl from "./sale.controller";

const router = Router();

router.use(authenticate, tenantContext);

// ─────────────────────────────────────────────────────────────────────────────
// POST   /api/v1/sales/checkout       — create a sale (critical path)
// GET    /api/v1/sales                — list sales with filters
// GET    /api/v1/sales/:id            — get single sale detail
// POST   /api/v1/sales/:id/void       — void a sale + restore stock
// POST   /api/v1/sales/:id/return     — return a sale (full or partial)
// ─────────────────────────────────────────────────────────────────────────────

router.post("/checkout", authorize(PERMISSIONS.SALE_CREATE), storeGuard, ctrl.checkout);

router.get("/", authorize(PERMISSIONS.SALE_READ), ctrl.list);

router.get("/:id", authorize(PERMISSIONS.SALE_READ), ctrl.getById);

router.post("/:id/void", authorize(PERMISSIONS.SALE_VOID), ctrl.voidSale);

router.post("/:id/return", authorize(PERMISSIONS.SALE_RETURN), ctrl.returnSale);

export default router;
