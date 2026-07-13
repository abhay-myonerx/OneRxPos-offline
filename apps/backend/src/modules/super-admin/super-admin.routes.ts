import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { requireSuperAdmin } from "../../middleware/requireSuperAdmin";
import { validate } from "../../middleware/validate";
import {
  createSuperAdminSchema,
  hardDeleteUserSchema,
  bulkUserActionSchema,
  resetAnyPasswordSchema,
} from "./super-admin.validation";
import * as controller from "./super-admin.controller";

const router = Router();

// All routes: must be authenticated AND a verified platform SUPER_ADMIN.
router.use(authenticate, authorize("*" as never), requireSuperAdmin);

// ── Super admin accounts ─────────────────────────────────────────────────────

// GET    /api/v1/super-admin/admins         — List all SUPER_ADMINs
router.get("/admins", controller.listSuperAdmins);

// POST   /api/v1/super-admin/admins         — Create a new SUPER_ADMIN
router.post("/admins", validate(createSuperAdminSchema), controller.createSuperAdmin);

// ── Platform stats ───────────────────────────────────────────────────────────

// GET    /api/v1/super-admin/stats          — Platform-wide stats
router.get("/stats", controller.getPlatformStats);

// ── Cross-tenant user management ─────────────────────────────────────────────

// GET    /api/v1/super-admin/users          — List all users (any tenant)
router.get("/users", controller.listAllUsers);

// GET    /api/v1/super-admin/users/:userId  — Get user details (any tenant)
router.get("/users/:userId", controller.getUserCrossTenant);

// DELETE /api/v1/super-admin/users/:userId  — Soft delete (deactivate)
router.delete("/users/:userId", controller.softDeleteUser);

// PATCH  /api/v1/super-admin/users/:userId/restore   — Restore deactivated user
router.patch("/users/:userId/restore", controller.restoreUser);

// DELETE /api/v1/super-admin/users/:userId/hard      — Permanent hard delete
router.delete("/users/:userId/hard", validate(hardDeleteUserSchema), controller.hardDeleteUser);

// POST   /api/v1/super-admin/users/bulk    — Bulk action on multiple users
router.post("/users/bulk", validate(bulkUserActionSchema), controller.bulkUserAction);

// POST   /api/v1/super-admin/users/:userId/reset-password — Reset any password
router.post(
  "/users/:userId/reset-password",
  validate(resetAnyPasswordSchema),
  controller.resetAnyUserPassword,
);

export default router;
