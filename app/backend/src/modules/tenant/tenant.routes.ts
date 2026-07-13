import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { requireSuperAdmin } from "../../middleware/requireSuperAdmin";
import { validate } from "../../middleware/validate";
import {
  updateTenantSchema,
  updateSettingsSchema,
  changePlanSchema,
  changeStatusSchema,
} from "./tenant.validation";
import * as controller from "./tenant.controller";

const router = Router();

// All tenant routes require authentication
router.use(authenticate, tenantContext);

// ── Own tenant (ADMIN+) ────────────────────────────────────────────────────

router.get("/me", authorize("tenant:manage"), controller.getMyTenant);
router.patch(
  "/me",
  authorize("tenant:manage"),
  validate(updateTenantSchema),
  controller.updateMyTenant,
);
router.get("/me/settings", authorize("tenant:manage"), controller.getSettings);
router.patch(
  "/me/settings",
  authorize("tenant:manage"),
  validate(updateSettingsSchema),
  controller.updateSettings,
);
router.get("/me/dashboard", authorize("tenant:manage"), controller.getDashboard);

// Manager dashboard — uses report:read permission so MANAGER role can access it
router.get("/me/manager-dashboard", authorize("report:read"), controller.getManagerDashboard);

router.get("/", requireSuperAdmin, controller.listTenants);
router.get("/:id", requireSuperAdmin, controller.getTenantById);
router.patch("/:id/plan", requireSuperAdmin, validate(changePlanSchema), controller.changePlan);
router.patch(
  "/:id/status",
  requireSuperAdmin,
  validate(changeStatusSchema),
  controller.changeStatus,
);

export default router;
