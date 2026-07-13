import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { PERMISSIONS } from "../../shared/types/enums";
import * as ctrl from "./customer.controller";

const router = Router();

router.use(authenticate, tenantContext);

// ── Customer groups ─────────────────────────────────────────────────────────
router.get("/groups", authorize(PERMISSIONS.CUSTOMER_READ), ctrl.listGroups);
router.post("/groups", authorize(PERMISSIONS.CUSTOMER_WRITE), ctrl.createGroup);
router.patch("/groups/:id", authorize(PERMISSIONS.CUSTOMER_WRITE), ctrl.updateGroup);
router.delete("/groups/:id", authorize(PERMISSIONS.CUSTOMER_WRITE), ctrl.deleteGroup);

// ── Loyalty ─────────────────────────────────────────────────────────────────
router.get("/loyalty/program", authorize(PERMISSIONS.CUSTOMER_READ), ctrl.getLoyaltyProgram);

// ── Customers CRUD ──────────────────────────────────────────────────────────
router.get("/", authorize(PERMISSIONS.CUSTOMER_READ), ctrl.list);
router.post("/", authorize(PERMISSIONS.CUSTOMER_WRITE), ctrl.create);
router.get("/:id", authorize(PERMISSIONS.CUSTOMER_READ), ctrl.getById);
router.patch("/:id", authorize(PERMISSIONS.CUSTOMER_WRITE), ctrl.update);
router.delete("/:id", authorize(PERMISSIONS.CUSTOMER_WRITE), ctrl.remove);

// ── Customer sub-routes ─────────────────────────────────────────────────────
router.get("/:id/ledger", authorize(PERMISSIONS.CUSTOMER_READ), ctrl.getLedger);
router.get("/:id/statement", authorize(PERMISSIONS.CUSTOMER_READ), ctrl.statement);
router.get("/:id/statement/print", authorize(PERMISSIONS.CUSTOMER_READ), ctrl.statementPrint);
router.post("/:id/statement/email", authorize(PERMISSIONS.CUSTOMER_READ), ctrl.emailStatement);
router.get("/:id/loyalty", authorize(PERMISSIONS.CUSTOMER_READ), ctrl.getLoyaltyHistory);
router.post("/:id/loyalty/adjust", authorize(PERMISSIONS.CUSTOMER_WRITE), ctrl.adjustPoints);

export default router;
