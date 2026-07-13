// src/local/__tests__/sync-triggers.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// THE ATOMICITY LOCK (SN-3 Task 1) — proves, through the REAL Prisma sqlite
// adapter against a genuinely encrypted temp file, that the generated
// sync-outbox capture triggers (src/local/sync-triggers.ts, installed by
// `pushSqliteSchema` in src/local/sqlite-push.ts) commit and roll back
// ATOMICALLY with the domain write they capture:
//
//   (a) a committed `$transaction` update produces exactly ONE `sync_outbox`
//       row for that write.
//   (b) a `$transaction` that updates then throws rolls back BOTH the domain
//       write AND its outbox row — no new `sync_outbox` row survives.
//
// This is the exact invariant the SN-3 spike (Task 0) proved was reachable
// only via SQLite triggers, not a Prisma `$extends` query extension. Mirrors
// the env-isolation pattern of src/local/__tests__/sqlite-push-seed.test.ts
// (vi.stubEnv + clearPrismaSingleton + vi.resetModules), which this file
// borrows verbatim.
// ─────────────────────────────────────────────────────────────────────────────
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "../key-derivation";
import { pushSqliteSchema } from "../sqlite-push";

// See sqlite-push-seed.test.ts for why this manual singleton-clear is
// necessary alongside vi.resetModules().
type GlobalWithPrisma = typeof globalThis & { prisma?: unknown };

function clearPrismaSingleton(): void {
  delete (globalThis as GlobalWithPrisma).prisma;
}

type SyncOutboxRow = {
  id: string;
  entity: string;
  entity_id: string;
  op: string;
  status: string;
};

describe("sync-outbox capture triggers — atomicity lock (SN-3 Task 1)", () => {
  let dir: string;
  let dbPath: string;
  const masterKey = "test-master-key-for-sync-triggers-0123456789abcdef";
  const deviceId = "test-device-sync-triggers";

  let seededUserId: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "rxpos-sync-triggers-"));
    dbPath = join(dir, "sn3-task1-test.db");

    vi.resetModules();
    clearPrismaSingleton();

    vi.stubEnv("DATA_BACKEND", "sqlite");
    vi.stubEnv("LOCAL_DB_PATH", dbPath);
    vi.stubEnv("LOCAL_DB_MASTER_KEY", masterKey);
    vi.stubEnv("SYNC_DEVICE_ID", deviceId);

    const key = deriveLocalDbKey(masterKey, deviceId);
    // Pushes the schema DDL AND installs the generated sync triggers
    // (src/local/sync-triggers.ts) on the same keyed connection.
    await pushSqliteSchema({ path: dbPath, key });

    const { prisma } = await import("../../config/database");
    const { seedSuperAdminSqlite } = await import("../seed-super-admin-sqlite");
    const seeded = await seedSuperAdminSqlite();
    seededUserId = seeded.id;
  }, 30_000);

  afterAll(async () => {
    const { prisma } = await import("../../config/database");
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

  it("triggers were installed: sync_outbox already holds the INSERT captured by seeding", async () => {
    const { prisma } = await import("../../config/database");
    const rows = await prisma.$queryRawUnsafe<SyncOutboxRow[]>(
      "SELECT id, entity, entity_id, op, status FROM sync_outbox WHERE entity = 'users' AND entity_id = ? AND op = 'insert'",
      seededUserId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });

  it("a COMMITTED $transaction update produces exactly ONE new sync_outbox row", async () => {
    const { prisma } = await import("../../config/database");

    const before = await prisma.$queryRawUnsafe<SyncOutboxRow[]>(
      "SELECT id FROM sync_outbox WHERE entity = 'users' AND entity_id = ? AND op = 'update'",
      seededUserId,
    );
    expect(before).toHaveLength(0);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: seededUserId },
        data: { firstName: "Updated" },
      });
    });

    const after = await prisma.$queryRawUnsafe<SyncOutboxRow[]>(
      "SELECT id, entity, entity_id, op, status FROM sync_outbox WHERE entity = 'users' AND entity_id = ? AND op = 'update'",
      seededUserId,
    );
    expect(after).toHaveLength(1);
    expect(after[0].entity).toBe("users");
    expect(after[0].entity_id).toBe(seededUserId);
    expect(after[0].op).toBe("update");
    expect(after[0].status).toBe("pending");
  });

  it("a ROLLED-BACK $transaction produces NO new sync_outbox row (atomicity)", async () => {
    const { prisma } = await import("../../config/database");

    const countBefore = await prisma.$queryRawUnsafe<{ n: number }[]>(
      "SELECT COUNT(*) as n FROM sync_outbox",
    );

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: seededUserId },
          data: { lastName: "ShouldNotPersist" },
        });
        throw new Error("deliberate rollback");
      }),
    ).rejects.toThrow("deliberate rollback");

    const countAfter = await prisma.$queryRawUnsafe<{ n: number }[]>(
      "SELECT COUNT(*) as n FROM sync_outbox",
    );
    expect(Number(countAfter[0].n)).toBe(Number(countBefore[0].n));

    // The domain write itself rolled back too — belt-and-suspenders check
    // that this is a genuine transactional rollback, not a passthrough.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: seededUserId } });
    expect(user.lastName).not.toBe("ShouldNotPersist");
  });
});
