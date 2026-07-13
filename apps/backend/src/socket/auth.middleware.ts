// JWT authentication middleware for Socket.IO connections

import type { Socket } from "socket.io";
import { verifyAccessToken, type TokenPayload } from "../shared/utils/jwt";
import { logger } from "../shared/utils/logger";

export interface AuthenticatedSocket extends Socket {
  user: {
    id: string;
    tenantId: string;
    storeId: string | null;
    storeIds: string[];
    role: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void): void {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const payload: TokenPayload = verifyAccessToken(token);

    (socket as AuthenticatedSocket).user = {
      id: payload.sub,
      tenantId: payload.tenantId,
      storeId: payload.storeId,
      storeIds: payload.storeIds,
      role: payload.role,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
    };

    logger.debug({ userId: payload.sub, role: payload.role }, "Socket authenticated");

    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
}
