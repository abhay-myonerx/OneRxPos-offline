// Service-level coverage for the in-app notification module. The base Prisma
// client (used for fan-out writes) and the Redis realtime publish are both
// mocked — tenant isolation is enforced at the Prisma-extension layer + the
// testcontainers canary, not duplicated here.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the realtime bridge so no Redis connection is required.
vi.mock("../../../socket/notification.handler", () => ({
  publishNotifications: vi.fn().mockResolvedValue(undefined),
}));

// Mock the base Prisma client used for cross-process fan-out writes.
// `vi.hoisted` makes the mock available inside the hoisted `vi.mock` factory.
const prismaMock = vi.hoisted(() => ({
  notification: {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  user: {
    findMany: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../../../config/database", () => ({
  prisma: prismaMock,
}));

import * as service from "../notification.service";
import { publishNotifications } from "../../../socket/notification.handler";
import { Role, NotificationType } from "../../../generated/prisma/enums";

const publishMock = publishNotifications as unknown as ReturnType<typeof vi.fn>;

function makeDb(impl: Partial<Record<string, unknown>> = {}): any {
  return {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      ...impl,
    },
  };
}

const content = {
  type: NotificationType.SYSTEM,
  title: "Hello",
  body: "World",
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.notification.createMany.mockResolvedValue({ count: 0 });
  prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.user.findMany.mockResolvedValue([]);
});

describe("notifyUsers", () => {
  it("persists one row per recipient and publishes them", async () => {
    await service.notifyUsers("tenant-1", ["u1", "u2"], content);

    expect(prismaMock.notification.createMany).toHaveBeenCalledTimes(1);
    const arg = prismaMock.notification.createMany.mock.calls[0][0];
    expect(arg.data).toHaveLength(2);
    expect(arg.data.every((r: { tenantId: string }) => r.tenantId === "tenant-1")).toBe(true);
    expect(arg.data.map((r: { userId: string }) => r.userId).sort()).toEqual(["u1", "u2"]);

    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock.mock.calls[0][0]).toHaveLength(2);
  });

  it("de-duplicates recipient ids", async () => {
    await service.notifyUsers("tenant-1", ["u1", "u1", "u2"], content);
    const arg = prismaMock.notification.createMany.mock.calls[0][0];
    expect(arg.data).toHaveLength(2);
  });

  it("no-ops on an empty audience", async () => {
    await service.notifyUsers("tenant-1", [], content);
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("never throws when persistence fails", async () => {
    prismaMock.notification.createMany.mockRejectedValueOnce(new Error("db down"));
    await expect(service.notifyUsers("tenant-1", ["u1"], content)).resolves.toBeUndefined();
    expect(publishMock).not.toHaveBeenCalled();
  });
});

describe("notifyRoles", () => {
  it("resolves active users by role then fans out", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }]);
    await service.notifyRoles("tenant-1", [Role.ADMIN, Role.MANAGER], content);

    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: "tenant-1", isActive: true });
    expect(where.role).toEqual({ in: [Role.ADMIN, Role.MANAGER] });
    expect(prismaMock.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it("adds a store OR null-store filter when storeId is given", async () => {
    await service.notifyRoles("tenant-1", [Role.MANAGER], content, { storeId: "store-9" });
    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ storeId: "store-9" }, { storeId: null }]);
  });
});

describe("inbox reads", () => {
  it("listForUser scopes by the caller's userId", async () => {
    const db = makeDb({
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    });
    await service.listForUser(db, "user-7", { page: 1, limit: 20 } as never);
    const where = db.notification.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe("user-7");
  });

  it("unreadCount counts only unread rows for the user", async () => {
    const db = makeDb({ count: vi.fn().mockResolvedValue(3) });
    const n = await service.unreadCount(db, "user-7");
    expect(n).toBe(3);
    expect(db.notification.count).toHaveBeenCalledWith({
      where: { userId: "user-7", isRead: false },
    });
  });

  it("markAllRead updates only the caller's unread rows", async () => {
    const db = makeDb({ updateMany: vi.fn().mockResolvedValue({ count: 5 }) });
    const n = await service.markAllRead(db, "user-7");
    expect(n).toBe(5);
    const arg = db.notification.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: "user-7", isRead: false });
    expect(arg.data.isRead).toBe(true);
  });

  it("markRead is ownership-scoped", async () => {
    const row = { id: "n1", userId: "user-7", isRead: true };
    const db = makeDb({
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(row),
    });
    const result = await service.markRead(db, "user-7", "n1");
    expect(result).toEqual(row);
    const arg = db.notification.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: "n1", userId: "user-7" });
  });
});

describe("resolveNotificationsForEntity", () => {
  it("marks every unread tenant notification referencing the entity as read", async () => {
    await service.resolveNotificationsForEntity("tenant-1", "leaveRequestId", "lr-9", {
      type: NotificationType.LEAVE,
    });

    expect(prismaMock.notification.updateMany).toHaveBeenCalledTimes(1);
    const arg = prismaMock.notification.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      tenantId: "tenant-1",
      isRead: false,
      type: NotificationType.LEAVE,
    });
    // JSON-path filter targets the entity reference inside the `data` payload.
    expect(arg.where.data).toEqual({
      path: ["leaveRequestId"],
      equals: "lr-9",
    });
    expect(arg.data.isRead).toBe(true);
    expect(arg.data.readAt).toBeInstanceOf(Date);
  });

  it("omits the type filter when none is supplied", async () => {
    await service.resolveNotificationsForEntity("tenant-1", "saleId", "s-1");
    const arg = prismaMock.notification.updateMany.mock.calls[0][0];
    expect("type" in arg.where).toBe(false);
  });

  it("never throws when the update fails (best-effort)", async () => {
    prismaMock.notification.updateMany.mockRejectedValueOnce(new Error("db down"));
    await expect(
      service.resolveNotificationsForEntity("tenant-1", "leaveRequestId", "lr-9"),
    ).resolves.toBeUndefined();
  });
});
