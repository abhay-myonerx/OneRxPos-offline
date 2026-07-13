import { AuthorizationError } from "@/shared/errors";
import { Request, Response, NextFunction } from "express";

export function storeGuard(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new AuthorizationError());
    return;
  }

  // Admins can access all stores
  if (req.user.role === "ADMIN" || req.user.role === "SUPER_ADMIN") {
    next();
    return;
  }

  const storeId: string | string[] =
    req.params?.storeId ??
    req.body?.storeId ??
    (Array.isArray(req.query?.storeId) ? req.query.storeId[0] : req.query?.storeId);

  // No storeId in request — nothing to guard
  if (!storeId || Array.isArray(storeId)) {
    next();
    return;
  }

  // Check against both primary storeId and multi-store access list
  const hasAccess = req.user.storeId === storeId || req.user.storeIds.includes(storeId);

  if (!hasAccess) {
    next(new AuthorizationError("You do not have access to this store"));
    return;
  }

  next();
}
