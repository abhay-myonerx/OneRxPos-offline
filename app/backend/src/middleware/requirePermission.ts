import { Request, Response, NextFunction } from "express";

import { AuthorizationError } from "@/shared/errors";
import { resolveUserPermissions, isSuperAdmin } from "../shared/permissions/resolver";
import type { PermissionV2 } from "../shared/permissions/v2-permissions";

function ensureAuthed(req: Request): boolean {
  return !!req.user;
}

export function requirePermission(permission: PermissionV2) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!ensureAuthed(req)) {
      next(new AuthorizationError());
      return;
    }
    if (isSuperAdmin(req.user!)) {
      next();
      return;
    }
    const perms = resolveUserPermissions(req.user!);
    if (!perms.has(permission)) {
      next(new AuthorizationError(`Missing required permission: ${permission}`));
      return;
    }
    next();
  };
}

export function requireAllPermissions(...permissions: PermissionV2[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!ensureAuthed(req)) {
      next(new AuthorizationError());
      return;
    }
    if (isSuperAdmin(req.user!)) {
      next();
      return;
    }
    const perms = resolveUserPermissions(req.user!);
    const missing = permissions.filter((p) => !perms.has(p));
    if (missing.length > 0) {
      next(new AuthorizationError(`Missing required permission(s): ${missing.join(", ")}`));
      return;
    }
    next();
  };
}

export function requireAnyPermission(...permissions: PermissionV2[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!ensureAuthed(req)) {
      next(new AuthorizationError());
      return;
    }
    if (isSuperAdmin(req.user!)) {
      next();
      return;
    }
    const perms = resolveUserPermissions(req.user!);
    const ok = permissions.some((p) => perms.has(p));
    if (!ok) {
      next(
        new AuthorizationError(`Missing any of required permission(s): ${permissions.join(", ")}`),
      );
      return;
    }
    next();
  };
}
