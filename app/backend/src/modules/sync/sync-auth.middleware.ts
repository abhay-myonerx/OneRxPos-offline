// Store-node sync auth middleware — mirrors `src/middleware/authenticate.ts`'s
// shape, but verifies against the DISTINCT `SYNC_TOKEN_SECRET` and requires
// `typ === "store-node"` so a regular user access token can never be used to
// call the sync endpoints (and vice versa).

import { Request, Response, NextFunction } from "express";
import { config } from "../../config";
import { AuthenticationError } from "@/shared/errors";
import { logger } from "../../shared/utils/logger";
import { verifyWithRotation, rotationKeys } from "@/shared/utils/token-rotation";
import type { SyncContext } from "./sync-token";

export function syncAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AuthenticationError("Missing or malformed Authorization header");
    }

    const token = header.slice(7);
    const payload = verifyWithRotation<SyncContext & { typ?: string }>(
      token,
      rotationKeys(config.SYNC_TOKEN_SECRET, config.SYNC_TOKEN_SECRET_PREVIOUS),
    );

    if (payload.typ !== "store-node") {
      throw new AuthenticationError("Invalid token type");
    }

    req.syncContext = {
      tenantId: payload.tenantId,
      storeId: payload.storeId,
      deviceId: payload.deviceId,
    };

    next();
  } catch (err) {
    logger.warn({ err, ip: req.ip, path: req.originalUrl }, "Sync JWT verification failed");
    next(new AuthenticationError("Invalid or expired token"));
  }
}
