// Handles barcode scanner events — mobile phone scans, relays to POS clients

import type { Server } from "socket.io";
import type { AuthenticatedSocket } from "./auth.middleware";
import { logger } from "../shared/utils/logger";

// Room naming: scanner devices and POS clients join the same room
// Room format: "pos:{tenantId}:{storeId}" — ensures scans only reach the correct store
function getPosRoom(tenantId: string, storeId: string): string {
  return `pos:${tenantId}:${storeId}`;
}

export function registerScannerHandlers(io: Server, socket: AuthenticatedSocket): void {
  const { user } = socket;

  // ── Join POS room ──────────────────────────────────────────────────────
  // Both scanner (phone) and POS (laptop) join the same room.
  // The "device" field distinguishes them.
  socket.on("scanner:join", (data: { storeId: string; device: "scanner" | "pos" }) => {
    const storeId = data.storeId || user.storeId;
    if (!storeId) {
      socket.emit("scanner:error", { message: "No store ID provided" });
      return;
    }

    // Verify user has access to this store
    if (user.storeId !== storeId && !user.storeIds.includes(storeId)) {
      socket.emit("scanner:error", { message: "Unauthorized for this store" });
      return;
    }

    const room = getPosRoom(user.tenantId, storeId);
    socket.join(room);

    // Store device type on socket data for later use
    socket.data.device = data.device;
    socket.data.storeId = storeId;
    socket.data.room = room;

    logger.info({ userId: user.id, room, device: data.device }, "Device joined POS room");

    // Notify room about the new device
    io.to(room).emit("scanner:device-joined", {
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`,
      device: data.device,
      socketId: socket.id,
    });

    // Send current connected devices count to the joining socket
    const roomSockets = io.sockets.adapter.rooms.get(room);
    socket.emit("scanner:room-info", {
      room,
      connectedDevices: roomSockets?.size || 1,
    });
  });

  // ── Barcode scanned (from phone) ───────────────────────────────────────
  socket.on("scanner:scan", (data: { barcode: string; storeId?: string }) => {
    const room = socket.data.room;
    if (!room) {
      socket.emit("scanner:error", {
        message: "Not joined to any POS room. Call scanner:join first.",
      });
      return;
    }

    if (!data.barcode || typeof data.barcode !== "string") {
      socket.emit("scanner:error", { message: "Invalid barcode" });
      return;
    }

    const barcode = data.barcode.trim();
    if (barcode.length < 1) {
      socket.emit("scanner:error", { message: "Empty barcode" });
      return;
    }

    logger.info({ userId: user.id, barcode, room }, "Barcode scanned from mobile");

    // Relay barcode to all POS clients in the same room (excluding the scanner itself)
    socket.to(room).emit("scanner:barcode-received", {
      barcode,
      scannedBy: {
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`,
      },
      timestamp: new Date().toISOString(),
    });

    // Acknowledge back to scanner
    socket.emit("scanner:scan-acknowledged", {
      barcode,
      timestamp: new Date().toISOString(),
    });
  });

  // ── Leave room ─────────────────────────────────────────────────────────
  socket.on("scanner:leave", () => {
    const room = socket.data.room;
    if (room) {
      socket.leave(room);

      io.to(room).emit("scanner:device-left", {
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`,
        device: socket.data.device,
        socketId: socket.id,
      });

      logger.info({ userId: user.id, room }, "Device left POS room");
      socket.data.room = null;
      socket.data.storeId = null;
    }
  });

  // ── Disconnect ─────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    const room = socket.data.room;
    if (room) {
      io.to(room).emit("scanner:device-left", {
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`,
        device: socket.data.device,
        socketId: socket.id,
      });
    }

    logger.info({ userId: user.id, reason, room }, "Socket disconnected");
  });
}
