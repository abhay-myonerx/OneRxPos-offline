import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../shared/utils/jwt";
import { Role } from "../generated/prisma/enums";
import { AuthenticationError } from "@/shared/errors";
import { logger } from "../shared/utils/logger";

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AuthenticationError("Missing or malformed Authorization header");
    }

    const token = header.slice(7);
    const payload = verifyAccessToken(token);

    req.user = {
      id: payload.sub,
      tenantId: payload.tenantId,
      storeId: payload.storeId,

      storeIds: payload.storeIds ?? [],
      role: payload.role as Role,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
    };

    req.tenantId = payload.tenantId;
    next();
  } catch (err) {
    logger.warn({ err, ip: req.ip, path: req.originalUrl }, "JWT verification failed");
    next(new AuthenticationError("Invalid or expired token"));
  }
}
