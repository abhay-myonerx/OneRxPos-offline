import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { storeGuard } from "../../middleware/storeGuard";
import { PERMISSIONS } from "../../shared/types/enums";
import * as ctrl from "./purchase.controller";

const router = Router();

router.use(authenticate, tenantContext);

router.get("/", authorize(PERMISSIONS.PURCHASE_READ), ctrl.list);
router.post("/", authorize(PERMISSIONS.PURCHASE_WRITE), storeGuard, ctrl.create);
router.get("/reorder-suggestions", authorize(PERMISSIONS.PURCHASE_READ), ctrl.reorderSuggestions);
router.get("/:id", authorize(PERMISSIONS.PURCHASE_READ), ctrl.getById);
router.post("/:id/email", authorize(PERMISSIONS.PURCHASE_READ), ctrl.emailPurchaseOrder);
router.post("/:id/receive", authorize(PERMISSIONS.PURCHASE_RECEIVE), ctrl.receiveGoods);
router.post("/:id/payment", authorize(PERMISSIONS.PURCHASE_WRITE), ctrl.addPayment);
router.post("/:id/cancel", authorize(PERMISSIONS.PURCHASE_WRITE), ctrl.cancel);

export default router;
