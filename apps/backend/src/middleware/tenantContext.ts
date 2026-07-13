import { Request, Response, NextFunction } from "express";
import { createTenantClient } from "../config/database";
import { AuthenticationError } from "@/shared/errors";

export function tenantContext(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.tenantId) {
    next(new AuthenticationError("Tenant context not available"));
    return;
  }

  req.db = createTenantClient(req.user.tenantId);
  next();
}
