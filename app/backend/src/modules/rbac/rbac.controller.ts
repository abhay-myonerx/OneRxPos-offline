import { Request, Response, NextFunction } from "express";

import { Role } from "../../generated/prisma/enums";
import * as rbacService from "./rbac.service";
import { ValidationError, NotFoundError } from "../../shared/errors";

export async function listRoles(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: rbacService.listRoles() });
  } catch (err) {
    next(err);
  }
}

export async function getRole(req: Request, res: Response, next: NextFunction) {
  try {
    const role = req.params.role as Role;
    if (!(role in Role) && !Object.values(Role).includes(role)) {
      throw new ValidationError("Unknown role");
    }
    const descriptor = rbacService.getRole(role);
    if (!descriptor) {
      throw new NotFoundError(`Role ${role} not found`);
    }
    res.json({ success: true, data: descriptor });
  } catch (err) {
    next(err);
  }
}

export async function listPermissions(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({
      success: true,
      data: { permissions: rbacService.listPermissionCatalogue() },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyPermissions(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new ValidationError("Not authenticated");
    }
    const result = rbacService.getEffectivePermissions(req.user);
    res.json({
      success: true,
      data: {
        userId: req.user.id,
        tenantId: req.user.tenantId,
        role: result.role,
        permissions: result.permissions,
      },
    });
  } catch (err) {
    next(err);
  }
}
