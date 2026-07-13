// src/modules/user/user.routes.ts (UPDATED)
// Added: PATCH /:id/restore, PATCH /me (update own profile)

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";
import { AuthorizationError } from "../../shared/errors/AuthorizationError";
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from "./user.validation";
import * as controller from "./user.controller";

const router = Router();

router.use(authenticate, tenantContext);

// ── Gate: allow ADMIN or MANAGER ─────────────────────────────────────────────

function authorizeUserManage(req: Request, _res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (!role) {
    next(new AuthorizationError());
    return;
  }
  if (role === "SUPER_ADMIN" || role === "ADMIN" || role === "MANAGER") {
    next();
    return;
  }
  next(new AuthorizationError("You do not have permission to manage users"));
}

// ── Self-service (any authenticated user) ─────────────────────────────────────

// PATCH  /api/v1/users/me   — Update own first/last name & phone
router.patch("/me", validate(updateProfileSchema), controller.updateMe);

// ── Admin user management ─────────────────────────────────────────────────────

// GET    /api/v1/users            — List users
router.get("/", authorizeUserManage, controller.list);

// POST   /api/v1/users            — Create a new user
router.post("/", authorizeUserManage, validate(createUserSchema), controller.create);

// GET    /api/v1/users/:id        — Get user detail
router.get("/:id", authorizeUserManage, controller.getById);

// PATCH  /api/v1/users/:id        — Update user profile / role / store
router.patch("/:id", authorizeUserManage, validate(updateUserSchema), controller.update);

// POST   /api/v1/users/:id/reset-password
router.post(
  "/:id/reset-password",
  authorizeUserManage,
  validate(resetPasswordSchema),
  controller.resetPassword,
);

// DELETE /api/v1/users/:id        — Soft-delete (deactivate)
router.delete("/:id", authorizeUserManage, controller.remove);

// PATCH  /api/v1/users/:id/restore — Re-activate a deactivated user (NEW)
router.patch("/:id/restore", authorizeUserManage, controller.restore);

export default router;
