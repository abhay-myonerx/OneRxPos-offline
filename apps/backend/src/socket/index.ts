// Socket.IO server setup — attach to HTTP server, configure auth, register handlers

import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { config } from "../config";
import { isRedisOptional, isRedisReady } from "../config/redis";
import { logger } from "../shared/utils/logger";
import { socketAuthMiddleware, type AuthenticatedSocket } from "./auth.middleware";
import { registerScannerHandlers } from "./scanner.handler";
import { registerHardwareHandlers } from "./hardware.handler";
import { registerNotificationRooms, initNotificationBridge } from "./notification.handler";

let io: Server | null = null;

export function initSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: config.CORS_ORIGINS.split(",").map((o) => o.trim()),
      credentials: true,
      methods: ["GET", "POST"],
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    transports: ["websocket", "polling"],
  });

  // ── Authentication middleware ───────────────────────────────────────────
  io.use(socketAuthMiddleware);

  // ── Connection handler ─────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const authedSocket = socket as AuthenticatedSocket;
    const { user } = authedSocket;

    logger.info({ userId: user.id, socketId: socket.id, role: user.role }, "Socket connected");

    // Join the per-user / role / tenant / store rooms used by the
    // real-time notification system.
    registerNotificationRooms(authedSocket);

    // Register barcode scanner event handlers
    registerScannerHandlers(io!, authedSocket);

    // Register hardware station-host relay handlers (Phase 2.9.4)
    registerHardwareHandlers(io!, authedSocket);

    // ── Ping/Pong for connection health ────────────────────────────────
    socket.on("ping:client", () => {
      socket.emit("pong:server", { timestamp: Date.now() });
    });
  });

  // Wire the Redis → Socket.IO bridge so notifications raised in any
  // process (API or BullMQ worker) reach connected clients. Fire-and-forget;
  // failures are logged inside and never block server start-up. On the
  // store-node (Redis optional & absent) skip it — a single process needs no
  // cross-process bridge, and an absent Redis would retry-loop forever.
  if (isRedisReady() || !isRedisOptional()) {
    void initNotificationBridge(io);
  } else {
    logger.info("Socket.IO: notification bridge skipped (store-node, Redis optional)");
  }

  logger.info("Socket.IO server initialized");
  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.IO not initialized — call initSocketIO first");
  return io;
}

export async function closeSocketIO(): Promise<void> {
  if (io) {
    await new Promise<void>((resolve) => {
      io!.close(() => {
        logger.info("Socket.IO server closed");
        resolve();
      });
    });
    io = null;
  }
}
