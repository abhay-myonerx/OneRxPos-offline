// Promotions (3H.4) — mounted at /api/v1/promotions.

import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as ctrl from "./promotion.controller";

const router = Router();

router.use(authenticate, tenantContext);

const READ = requirePermission(PERMISSIONS_V2.PROMOTION_READ);
const WRITE = requirePermission(PERMISSIONS_V2.PROMOTION_WRITE);

router.get("/", READ, ctrl.list);
router.post("/", WRITE, ctrl.create);
router.post("/preview", READ, ctrl.preview);
router.post("/validate-coupon", READ, ctrl.validateCoupon);
router.patch("/:id", WRITE, ctrl.update);
router.post("/:id/activate", WRITE, ctrl.activate);
router.delete("/:id", WRITE, ctrl.remove);

export default router;
