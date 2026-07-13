// Real-time in-app notification delivery over Socket.IO.
//
// Two concerns live here:
//
//   1. Rooms — every authenticated socket auto-joins a personal room plus
//      its role/tenant/store rooms on connect (see `registerNotificationRooms`).
//      Notifications are addressed to the per-user room so each recipient gets
//      exactly the rows that belong to them.
//
//   2. Cross-process bridge — the notification service persists rows and then
//      PUBLISHES to a Redis channel. Persistence happens in either the API
//      process or the standalone BullMQ worker (which has no Socket.IO server),
//      so delivery is decoupled: every API instance SUBSCRIBES to the channel
//      and re-emits to its locally-connected sockets. This is both worker-safe
//      and horizontally-scalable (each instance fans out to its own clients).

import type { Server } from "socket.io";
import { redis, redisSubscriber } from "../config/redis";
import { logger } from "../shared/utils/logger";
import type { AuthenticatedSocket } from "./auth.middleware";

// Redis pub/sub channel for notification fan-out.
export const NOTIFICATION_CHANNEL = "rxpos:notifications";

// ── Room naming ─────────────────────────────────────────────────────────────

export function userRoom(tenantId: string, userId: string): string {
  return `tenant:${tenantId}:user:${userId}`;
}

export function roleRoom(tenantId: string, role: string): string {
  return `tenant:${tenantId}:role:${role}`;
}

export function tenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

export function storeRoom(tenantId: string, storeId: string): string {
  return `tenant:${tenantId}:store:${storeId}`;
}

// ── Connection rooms ─────────────────────────────────────────────────────────

/**
 * Joins the standard notification rooms for a freshly-connected, authenticated
 * socket. Called once from the main connection handler.
 */
export function registerNotificationRooms(socket: AuthenticatedSocket): void {
  const { user } = socket;

  socket.join(userRoom(user.tenantId, user.id));
  socket.join(roleRoom(user.tenantId, user.role));
  socket.join(tenantRoom(user.tenantId));

  const storeIds = new Set<string>(user.storeIds ?? []);
  if (user.storeId) storeIds.add(user.storeId);
  for (const sid of storeIds) {
    socket.join(storeRoom(user.tenantId, sid));
  }

  logger.debug(
    { userId: user.id, role: user.role, stores: [...storeIds] },
    "Socket joined notification rooms",
  );
}

// ── Cross-process bridge ───────────────────────────────────────────────────

// Shape published on the Redis channel — one persisted notification row per
// recipient, already fanned-out by the service.
export interface RealtimeNotification {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

interface ChannelMessage {
  items: RealtimeNotification[];
}

/**
 * Publishes a batch of already-persisted notifications to the Redis channel.
 * Fire-and-forget — a publish failure is logged but never blocks the caller
 * (the rows are already in the DB and will surface on the next fetch).
 */
export async function publishNotifications(items: RealtimeNotification[]): Promise<void> {
  if (items.length === 0) return;
  try {
    await redis.publish(NOTIFICATION_CHANNEL, JSON.stringify({ items } satisfies ChannelMessage));
  } catch (err) {
    logger.warn({ err }, "Failed to publish notifications to Redis channel");
  }
}

let bridgeInitialised = false;

/**
 * Wires the Redis → Socket.IO bridge. Idempotent. Called once at startup from
 * `initSocketIO` after the server is created.
 */
export async function initNotificationBridge(io: Server): Promise<void> {
  if (bridgeInitialised) return;
  bridgeInitialised = true;

  try {
    // A subscribed ioredis client cannot issue regular commands, so we use
    // the dedicated subscriber connection from config/redis.
    if (redisSubscriber.status === "wait" || redisSubscriber.status === "end") {
      await redisSubscriber.connect();
    }
    await redisSubscriber.subscribe(NOTIFICATION_CHANNEL);

    redisSubscriber.on("message", (channel: string, raw: string) => {
      if (channel !== NOTIFICATION_CHANNEL) return;
      try {
        const { items } = JSON.parse(raw) as ChannelMessage;
        for (const n of items) {
          io.to(userRoom(n.tenantId, n.userId)).emit("notification:new", n);
        }
      } catch (err) {
        logger.warn({ err }, "Failed to handle notification channel message");
      }
    });

    logger.info("Notification realtime bridge subscribed");
  } catch (err) {
    // Non-fatal: notifications still persist and show up on next fetch.
    logger.error({ err }, "Failed to initialise notification realtime bridge");
  }
}
