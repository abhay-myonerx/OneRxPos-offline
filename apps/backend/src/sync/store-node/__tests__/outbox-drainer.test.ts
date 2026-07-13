// src/sync/store-node/__tests__/outbox-drainer.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// SN-3 Task 2 — TDD spec for the outbox drainer + freshness against a REAL
// pushed+seeded temp encrypted SQLite store-node DB (mirrors the isolation
// pattern in src/local/__tests__/sync-triggers.test.ts: vi.stubEnv +
// clearPrismaSingleton + vi.resetModules), so the pending rows exercised here
// are genuine trigger-captured rows, not hand-inserted fixtures.
//
// Scenarios (run in order — each builds on the outbox state the previous
// left behind, diffed explicitly rather than asserting exact totals):
//   1. no cloud configured -> no-op, rows stay pending, domain write intact.
//   2. stub cloud 200      -> rows synced, POST body payload DECRYPTS to
//                             { entity, entityId, op, data }.
//   3. stub cloud 500      -> rows stay pending, attempts+1, next_attempt_at
//                             advanced by exactly backoffMs(1); never throws.
//   4. getFreshness        -> pending/synced counts + lastSyncedAt agree with
//                             direct sync_outbox queries.
// ─────────────────────────────────────────────────────────────────────────────
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "../../../local/key-derivation";
import { pushSqliteSchema } from "../../../local/sqlite-push";
import { decryptEvent } from "../../../local/event-crypto";
import { backoffMs } from "../../outbox";
import { drainOutbox } from "../outbox-drainer";
import { getFreshness } from "../freshness";

type GlobalWithPrisma = typeof globalThis & { prisma?: unknown };

function clearPrismaSingleton(): void {
  delete (globalThis as GlobalWithPrisma).prisma;
}

type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };

describe("outbox drainer + freshness (SN-3 Task 2)", () => {
  let dir: string;
  let dbPath: string;
  const masterKey = "test-master-key-for-outbox-drainer-0123456789ab";
  const deviceId = "test-device-outbox-drainer";
  // Arbitrary but fixed 32-byte AES-256-GCM key for encryptEvent/decryptEvent.
  const encKey = Buffer.alloc(32, 7);

  let seededUserId: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "rxpos-outbox-drainer-"));
    dbPath = join(dir, "sn3-task2-test.db");

    vi.resetModules();
    clearPrismaSingleton();

    vi.stubEnv("DATA_BACKEND", "sqlite");
    vi.stubEnv("LOCAL_DB_PATH", dbPath);
    vi.stubEnv("LOCAL_DB_MASTER_KEY", masterKey);
    vi.stubEnv("SYNC_DEVICE_ID", deviceId);

    const key = deriveLocalDbKey(masterKey, deviceId);
    // Pushes the schema DDL AND installs the SN-3 Task 1 capture triggers.
    await pushSqliteSchema({ path: dbPath, key });

    const { seedSuperAdminSqlite } = await import("../../../local/seed-super-admin-sqlite");
    const seeded = await seedSuperAdminSqlite();
    seededUserId = seeded.id;
  }, 30_000);

  afterAll(async () => {
    const { prisma } = await import("../../../config/database");
    await prisma.$disconnect();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup — a lingering handle here doesn't fail the test.
    }

    vi.unstubAllEnvs();
    clearPrismaSingleton();
    vi.resetModules();
  });

  it("no cloud configured: no-ops, pending rows stay pending, the domain write already succeeded (offline path intact)", async () => {
    const { prisma } = await import("../../../config/database");

    // The seed super-admin write above already captured at least one
    // 'users' insert row via the trigger — the offline sale/write completed
    // with zero cloud configuration, which is the whole point.
    const pendingBefore = await prisma.syncOutbox.count({ where: { status: "pending" } });
    expect(pendingBefore).toBeGreaterThan(0);

    const result = await drainOutbox(prisma, { key: encKey });
    expect(result).toEqual({ pushed: 0, failed: 0 });

    const pendingAfter = await prisma.syncOutbox.count({ where: { status: "pending" } });
    expect(pendingAfter).toBe(pendingBefore);
  });

  it("stub cloud 200: drains pending rows, marks them synced, and the POST body's payload DECRYPTS to {entity, entityId, op, data}", async () => {
    const { prisma } = await import("../../../config/database");

    const pendingBefore = await prisma.syncOutbox.findMany({ where: { status: "pending" } });
    expect(pendingBefore.length).toBeGreaterThan(0);

    let capturedUrl: string | undefined;
    let capturedInit: FetchInit | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: FetchInit) => {
      capturedUrl = url;
      capturedInit = init;
      return { ok: true, status: 200 } as Response;
    });

    const result = await drainOutbox(prisma, {
      cloudUrl: "http://cloud.test",
      token: "test-token",
      key: encKey,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.pushed).toBe(pendingBefore.length);
    expect(result.failed).toBe(0);
    expect(capturedUrl).toBe("http://cloud.test/sync");
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.headers?.Authorization).toBe("Bearer test-token");

    const stillPending = await prisma.syncOutbox.count({ where: { status: "pending" } });
    expect(stillPending).toBe(0);
    const syncedCount = await prisma.syncOutbox.count({ where: { status: "synced" } });
    expect(syncedCount).toBe(pendingBefore.length);

    const body = JSON.parse(capturedInit!.body!) as {
      events: { id: string; entity: string; op: string; payload: string }[];
    };
    expect(body.events.length).toBe(pendingBefore.length);

    const userEvent = body.events.find((e) => e.entity === "users");
    expect(userEvent).toBeDefined();
    // The payload is opaque ciphertext on the wire — assert it does NOT
    // contain the plaintext entityId, then decrypt it and check the shape.
    expect(userEvent!.payload).not.toContain(seededUserId);

    const decrypted = JSON.parse(decryptEvent(userEvent!.payload, encKey)) as {
      entity: string;
      entityId: string;
      op: string;
      data: { id: string } | null;
    };
    expect(decrypted.entity).toBe("users");
    expect(decrypted.entityId).toBe(seededUserId);
    expect(decrypted.op).toBe("insert");
    expect(decrypted.data).not.toBeNull();
    expect(decrypted.data!.id).toBe(seededUserId);
  });

  it("stub cloud 500: pending rows stay pending with attempts+1 and next_attempt_at advanced by exactly backoffMs(1); drainOutbox does not throw", async () => {
    const { prisma } = await import("../../../config/database");

    // Generate a fresh pending row (everything from the previous test is
    // now 'synced').
    await prisma.user.update({
      where: { id: seededUserId },
      data: { firstName: "Drainer500" },
    });

    const pendingBefore = await prisma.syncOutbox.findMany({ where: { status: "pending" } });
    expect(pendingBefore.length).toBeGreaterThan(0);
    expect(pendingBefore.every((r) => r.attempts === 0)).toBe(true);

    const now = Date.now();
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }) as Response);

    let result: { pushed: number; failed: number } | undefined;
    await expect(
      (async () => {
        result = await drainOutbox(prisma, {
          cloudUrl: "http://cloud.test",
          key: encKey,
          fetchImpl: fetchImpl as unknown as typeof fetch,
          now,
        });
      })(),
    ).resolves.not.toThrow();

    expect(result).toBeDefined();
    expect(result!.pushed).toBe(0);
    expect(result!.failed).toBe(pendingBefore.length);

    const rowsAfter = await prisma.syncOutbox.findMany({
      where: { id: { in: pendingBefore.map((r) => r.id) } },
    });
    expect(rowsAfter.length).toBe(pendingBefore.length);
    for (const row of rowsAfter) {
      expect(row.status).toBe("pending");
      expect(row.attempts).toBe(1);
      expect(row.lastError).toContain("500");
      expect(row.nextAttemptAt).not.toBeNull();
      expect(row.nextAttemptAt!.getTime()).toBe(now + backoffMs(1));
    }
  });

  it("getFreshness reports pending/synced counts + lastSyncedAt consistent with direct sync_outbox queries", async () => {
    const { prisma } = await import("../../../config/database");

    const fresh = await getFreshness(prisma);

    const pendingCount = await prisma.syncOutbox.count({ where: { status: "pending" } });
    const syncedCount = await prisma.syncOutbox.count({ where: { status: "synced" } });
    const mostRecentSynced = await prisma.syncOutbox.findFirst({
      where: { status: "synced" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    expect(fresh.pending).toBe(pendingCount);
    expect(fresh.synced).toBe(syncedCount);
    expect(fresh.synced).toBeGreaterThan(0); // the stub-200 test synced at least one row
    expect(fresh.lastSyncedAt).toBe(mostRecentSynced!.createdAt.toISOString());
  });
});
