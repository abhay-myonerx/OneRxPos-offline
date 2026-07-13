import { Router } from "express";

import { authenticate } from "@/middleware/authenticate";
import { tenantContext } from "@/middleware/tenantContext";
import { authorize } from "@/middleware/authorize";
import { PERMISSIONS } from "@/shared/types/enums";

import * as ctrl from "./enroll.controller";

const router = Router();

// POST /api/v2/pos/enroll — bind this Electron lane's fingerprint to the
// tenant/store so it can later use PIN quick-login (Task 8).
router.post(
  "/enroll",
  authenticate,
  tenantContext,
  authorize(PERMISSIONS.DEVICE_ENROLL),
  ctrl.enrollController,
);

// POST /api/v2/pos/devices/:id/revoke — deactivate an enrolled device.
router.post(
  "/devices/:id/revoke",
  authenticate,
  tenantContext,
  authorize(PERMISSIONS.DEVICE_REVOKE),
  ctrl.revokeController,
);

export default router;
