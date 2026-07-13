// Station-host relay. A thin client (iPad/web) that cannot physically reach a
// USB/serial peripheral relays the action to the store's hardware-host station,
// which executes it via native drivers and returns the result. Mirrors the
// scanner relay (same room scheme + store-access check).

import type { Server } from "socket.io";
import type { AuthenticatedSocket } from "./auth.middleware";
import type { DeviceInfo } from "rx-pos-shared";
import { registerHost, unregisterHost, getHost } from "./hardware-hosts";
import { logger } from "../shared/utils/logger";

function getPosRoom(tenantId: string, storeId: string): string {
  return `pos:${tenantId}:${storeId}`;
}

// How long to wait for the host station to answer a relayed action.
const EXECUTE_TIMEOUT_MS = 8000;

type RelayAck = (res: unknown) => void;

export function registerHardwareHandlers(io: Server, socket: AuthenticatedSocket): void {
  const { user } = socket;

  const canAccess = (storeId: string): boolean =>
    user.storeId === storeId || user.storeIds.includes(storeId);

  // ── Host station registers itself + its native devices for a store ──────
  socket.on(
    "hardware:host-register",
    (data: { storeId: string; devices: DeviceInfo[] }) => {
      const storeId = data.storeId || user.storeId;
      if (!storeId) {
        socket.emit("hardware:error", { message: "No store ID provided" });
        return;
      }
      if (!canAccess(storeId)) {
        socket.emit("hardware:error", { message: "Unauthorized for this store" });
        return;
      }
      const room = getPosRoom(user.tenantId, storeId);
      socket.join(room);
      socket.data.hwHostRoom = room;
      registerHost(room, socket.id, data.devices ?? []);
      logger.info(
        { userId: user.id, room, devices: data.devices?.length ?? 0 },
        "Hardware host registered",
      );
      socket.emit("hardware:host-registered", { room });
    },
  );

  // ── Thin client requests an action; relay to the host, return via ack ───
  socket.on(
    "hardware:request",
    (
      data: { storeId: string; action: "print" | "drawer" | "weigh"; payload?: unknown },
      ack?: RelayAck,
    ) => {
      const storeId = data.storeId || user.storeId;
      if (!storeId) return ack?.({ ok: false, reason: "no-store" });
      if (!canAccess(storeId)) return ack?.({ ok: false, reason: "unauthorized" });

      const room = getPosRoom(user.tenantId, storeId);
      const host = getHost(room);
      if (!host) return ack?.({ ok: false, reason: "no-host" });

      const hostSocket = io.sockets.sockets.get(host.socketId);
      if (!hostSocket) return ack?.({ ok: false, reason: "host-offline" });

      hostSocket
        .timeout(EXECUTE_TIMEOUT_MS)
        .emit(
          "hardware:execute",
          { action: data.action, payload: data.payload },
          (err: Error | null, response: unknown) => {
            if (err) return ack?.({ ok: false, reason: "host-timeout" });
            ack?.(response);
          },
        );
    },
  );

  // ── Disconnect: clear this host's registration (stale-safe) ─────────────
  socket.on("disconnect", () => {
    const room = socket.data.hwHostRoom as string | undefined;
    if (room) unregisterHost(room, socket.id);
  });
}
