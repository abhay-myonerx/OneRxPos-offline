// Real-time in-app notification service.
//
// DESIGN
// ------
// • Writes are done with the BASE `prisma` client (not a tenant-scoped client)
//   because notifications are also raised from the standalone BullMQ worker,
//   which has no request context. Every write passes an explicit `tenantId`
//   and `userId`, so tenant isolation is preserved by construction.
// • Reads (the inbox endpoints) use the tenant-scoped `req.db` AND an explicit
//   `userId` filter — defence in depth: tenant scoping from the client plus
//   per-user ownership from the service.
// • Fan-out (role / store / tenant → individual users) is resolved here at
//   creation time into one row per recipient, then published to Redis for
//   real-time delivery (see socket/notification.handler.ts).

import { randomUUID } from "crypto";

import { prisma } from "../../config/database";
import type { TenantPrismaClient } from "../../config/database";
import { Role, NotificationType } from "../../generated/prisma/enums";
import { logger } from "../../shared/utils/logger";
import { publishNotifications, type RealtimeNotification } from "../../socket/notification.handler";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import type { ListNotificationInput } from "./notification.validation";

// ── Creation payload ─────────────────────────────────────────────────────────

export interface NotificationContent {
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  data?: Record<string, unknown>;
}

// ── Core fan-out ───────────────────────────────────────────────────────────

/**
 * Persists one notification row per recipient user, then publishes the batch
 * for real-time delivery. De-duplicates user ids. No-ops on an empty audience.
 *
 * Fire-and-forget at the call site: notification delivery must never break the
 * business operation that triggered it, so callers should not `await` this in a
 * way that can fail their transaction. This function swallows its own errors.
 */
export async function notifyUsers(
  tenantId: string,
  userIds: string[],
  content: NotificationContent,
): Promise<void> {
  const recipients = [...new Set(userIds)].filter(Boolean);
  if (recipients.length === 0) return;

  const createdAt = new Date();
  const rows = recipients.map((userId) => ({
    id: randomUUID(),
    tenantId,
    userId,
    type: content.type,
    title: content.title,
    body: content.body,
    link: content.link ?? null,
    data: (content.data ?? {}) as object,
    isRead: false,
    createdAt,
  }));

  try {
    await prisma.notification.createMany({ data: rows });
  } catch (err) {
    logger.error({ err, tenantId, type: content.type }, "Failed to persist notifications");
    return;
  }

  const realtime: RealtimeNotification[] = rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    userId: r.userId,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    data: (r.data ?? {}) as Record<string, unknown>,
    isRead: false,
    createdAt: createdAt.toISOString(),
  }));

  await publishNotifications(realtime);
}

/**
 * Resolves the active users matching the given roles (optionally restricted to
 * a store) and notifies them. When `storeId` is supplied, recipients are users
 * assigned to that store OR tenant-level users with no store binding (e.g.
 * ADMIN) — so store-floor staff and head-office both get store-scoped alerts.
 */
export async function notifyRoles(
  tenantId: string,
  roles: Role[],
  content: NotificationContent,
  opts: { storeId?: string | null } = {},
): Promise<void> {
  try {
    const where: Record<string, unknown> = {
      tenantId,
      isActive: true,
      role: { in: roles },
    };
    if (opts.storeId) {
      where.OR = [{ storeId: opts.storeId }, { storeId: null }];
    }
    const users = await prisma.user.findMany({ where, select: { id: true } });
    await notifyUsers(
      tenantId,
      users.map((u) => u.id),
      content,
    );
  } catch (err) {
    logger.error({ err, tenantId, roles }, "notifyRoles failed");
  }
}

/** Notifies every active user assigned to a store. */
export async function notifyStore(
  tenantId: string,
  storeId: string,
  content: NotificationContent,
): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId, isActive: true, storeId },
      select: { id: true },
    });
    await notifyUsers(
      tenantId,
      users.map((u) => u.id),
      content,
    );
  } catch (err) {
    logger.error({ err, tenantId, storeId }, "notifyStore failed");
  }
}

/** Notifies every active user in the tenant. */
export async function notifyTenant(tenantId: string, content: NotificationContent): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true },
    });
    await notifyUsers(
      tenantId,
      users.map((u) => u.id),
      content,
    );
  } catch (err) {
    logger.error({ err, tenantId }, "notifyTenant failed");
  }
}

// ── Inbox reads (request-scoped) ───────────────────────────────────────────

const searchableFields = ["title", "body"] as const;

/** Lists the authenticated user's notifications, newest-first, paginated. */
export async function listForUser(
  db: TenantPrismaClient,
  userId: string,
  params: ListNotificationInput,
) {
  const { isRead, type, ...rest } = params;

  const extraWhere: Record<string, unknown> = { userId };
  if (isRead !== undefined) extraWhere.isRead = isRead;
  if (type !== undefined) extraWhere.type = type;

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(rest as never, {
    searchableFields,
    extraWhere,
  });

  const [data, total] = await Promise.all([
    db.notification.findMany({ where, orderBy, skip, take }),
    db.notification.count({ where }),
  ]);
  return formatListResponse(data, total, meta);
}

/** Returns the authenticated user's unread notification count. */
export async function unreadCount(db: TenantPrismaClient, userId: string): Promise<number> {
  return db.notification.count({ where: { userId, isRead: false } });
}

/** Marks a single notification read. Scoped to the owner — returns null if
 *  the id doesn't belong to the user (or doesn't exist). */
export async function markRead(db: TenantPrismaClient, userId: string, id: string) {
  const result = await db.notification.updateMany({
    where: { id, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  if (result.count === 0) {
    // Either already read, or not owned by this user. Return the row if it
    // exists and is owned, else null (so the controller can 404).
    return db.notification.findFirst({ where: { id, userId } });
  }
  return db.notification.findFirst({ where: { id, userId } });
}

/** Marks all of the user's unread notifications read. Returns the count. */
export async function markAllRead(db: TenantPrismaClient, userId: string): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count;
}

// ── Entity-scoped resolution ───────────────────────────────────────────────

/**
 * Marks every unread notification that references a given entity (via its
 * `data` payload) as read, across ALL recipients in the tenant.
 *
 * Use this when an actionable, fan-out notification (e.g. "New leave request
 * pending approval", delivered to every HR/MANAGER/ADMIN) becomes stale once
 * the underlying entity reaches a terminal state. Without it, an approval by
 * one approver leaves the unread badge stuck on every OTHER approver's inbox
 * until they open it — those recipients have no owner-driven "read" trigger.
 *
 * Uses the base client with an explicit `tenantId` (mirrors the fan-out
 * writers) and swallows its own errors — clearing a stale notification must
 * never break the business operation that triggered it.
 */
export async function resolveNotificationsForEntity(
  tenantId: string,
  dataKey: string,
  dataValue: string,
  opts: { type?: NotificationType } = {},
): Promise<void> {
  try {
    await prisma.notification.updateMany({
      where: {
        tenantId,
        isRead: false,
        ...(opts.type ? { type: opts.type } : {}),
        data: { path: [dataKey], equals: dataValue },
      },
      data: { isRead: true, readAt: new Date() },
    });
  } catch (err) {
    logger.error({ err, tenantId, dataKey, dataValue }, "resolveNotificationsForEntity failed");
  }
}
