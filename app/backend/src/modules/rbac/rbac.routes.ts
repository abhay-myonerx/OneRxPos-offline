// RBAC inspection endpoints. Used by the frontend to render permission-aware
// UI and by tenant admins to audit role assignments.
//
// All endpoints require authentication. The "list catalogue" endpoints are
// readable by any authenticated user (they expose only the static role
// descriptors and permission strings — no tenant data). Mutations to grants
// will land with the PermissionGrant table; they are intentionally
// not exposed here yet.

import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import * as controller from "./rbac.controller";

const router = Router();

// All RBAC endpoints require auth. tenantContext is applied to the
// permissions-of-self endpoint (the inspection endpoints don't need it
// because they expose only static catalogue data).
router.use(authenticate);

router.get("/roles", controller.listRoles);
router.get("/roles/:role", controller.getRole);
router.get("/permissions", controller.listPermissions);

// Effective permissions for the *currently authenticated* user.
router.get("/me/permissions", tenantContext, controller.getMyPermissions);

export default router;
