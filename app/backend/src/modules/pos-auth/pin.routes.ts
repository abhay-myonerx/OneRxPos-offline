import { Router } from "express";

import { authenticate } from "@/middleware/authenticate";
import { tenantContext } from "@/middleware/tenantContext";
import { authorize } from "@/middleware/authorize";
import { PERMISSIONS } from "@/shared/types/enums";

import * as ctrl from "./pin.controller";

const router = Router();

// POST /api/v2/pos/pin — set (or replace) the caller's own PIN.
router.post("/pin", authenticate, ctrl.setPinController);

// POST /api/v2/pos/users/:id/pin-reset — manager-initiated reset; forces
// the target user to set a fresh PIN before quick-login works again.
// tenantContext is required so the target user is verified to belong to
// the caller's tenant before their PIN is deleted (cross-tenant IDOR fix).
router.post(
  "/users/:id/pin-reset",
  authenticate,
  tenantContext,
  authorize(PERMISSIONS.USER_PIN_RESET),
  ctrl.resetPinController,
);

// POST /api/v2/pos/pin-login — PIN quick-login. Deliberately NO
// `authenticate`/`tenantContext`: this route IS the login, so there is no
// session yet. The tenant is resolved server-side from the globally-unique
// `userId` in the body (never from a request-derived tenant) — see the
// SECURITY note in `pin.service.ts`.
router.post("/pin-login", ctrl.pinLoginController);

export default router;
