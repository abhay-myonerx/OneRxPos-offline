import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { PERMISSIONS } from "../../shared/types/enums";
import * as ctrl from "./supplier.controller";

const router = Router();

router.use(authenticate, tenantContext);

router.get("/", authorize(PERMISSIONS.SUPPLIER_READ), ctrl.list);
router.post("/", authorize(PERMISSIONS.SUPPLIER_WRITE), ctrl.create);
router.get("/:id", authorize(PERMISSIONS.SUPPLIER_READ), ctrl.getById);
router.patch("/:id", authorize(PERMISSIONS.SUPPLIER_WRITE), ctrl.update);
router.delete("/:id", authorize(PERMISSIONS.SUPPLIER_WRITE), ctrl.remove);

export default router;
