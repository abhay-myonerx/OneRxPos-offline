// Middleware that closes /auth/register once the system has been set up.
// First-run signup happens through /setup/complete instead.

import { Request, Response, NextFunction } from "express";
import { prisma } from "../../config/database";
import { ConflictError } from "../../shared/errors/ConflictError";

export async function blockRegistrationWhenTenantExists(
  _req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const tenantCount = await prisma.tenant.count();
    if (tenantCount > 0) {
      throw new ConflictError(
        "Registration is closed. Contact your administrator to be invited as a user.",
      );
    }
    next();
  } catch (error) {
    next(error);
  }
}
