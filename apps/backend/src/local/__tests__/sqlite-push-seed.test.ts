// SN-1 Task 4 — db push + super-admin seed onto the encrypted SQLCipher file.
//
// Verifies, against a TEMP LOCAL_DB_PATH:
//  1. `pushSqliteSchema` creates the sqlite schema (Task 2) inside a file
//     that is genuinely encrypted (non-plaintext SQLite header).
//  2. The pushed file is the SAME file the resolved client
//     (src/config/database.ts) opens — asserted by querying `user` through
//     that resolved client right after the push, with no separate wiring.
//  3. `seedSuperAdminSqlite` inserts exactly one SUPER_ADMIN row, and is
//     idempotent (running it twice doesn't create a duplicate).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "../key-derivation";
import { pushSqliteSchema } from "../sqlite-push";
import { buildSqliteAdapter } from "../sqlcipher-adapter";

// The Prisma singleton in `src/config/database.ts` is cached on
// `globalThis.prisma` outside NODE_ENV==="production" (hot-reload
// preservation). `vi.resetModules()` alone only clears vitest's module
// registry — it does NOT touch globalThis — so we also delete the cached
// instance ourselves before the first `../../config/database` import to
// force a fresh client build against the freshly-stubbed env. Mirrors
// src/config/__tests__/data-backend.test.ts's precedent exactly.
type GlobalWithPrisma = typeof globalThis & { prisma?: unknown };

function clearPrismaSingleton(): void {
  delete (globalThis as GlobalWithPrisma).prisma;
}

describe("sqlite db push + super-admin seed (SN-1 Task 4)", () => {
  let dir: string;
  let dbPath: string;
  const masterKey = "test-master-key-for-push-seed-0123456789abcdef";
  const deviceId = "test-device-push-seed";

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "rxpos-push-seed-"));
    dbPath = join(dir, "sn1-test.db");

    vi.resetModules();
    clearPrismaSingleton();

    // Consumed by src/config/index.ts (parsed lazily below, via dynamic
    // import, so these are set before that module ever loads in this
    // test file's isolated module registry). `vi.stubEnv` (not raw
    // `process.env.X = ...`) so `afterAll` can cleanly restore the prior
    // environment via `vi.unstubAllEnvs()` and avoid bleeding a leftover
    // DATA_BACKEND=sqlite / stale LOCAL_DB_PATH into the next test file
    // in this worker.
    vi.stubEnv("DATA_BACKEND", "sqlite");
    vi.stubEnv("LOCAL_DB_PATH", dbPath);
    vi.stubEnv("LOCAL_DB_MASTER_KEY", masterKey);
    vi.stubEnv("SYNC_DEVICE_ID", deviceId);
  });

  afterAll(async () => {
    // Release the better-sqlite3 file handle before deleting the temp dir —
    // otherwise Windows throws EPERM on rmSync while the file is still open.
    const { prisma } = await import("../../config/database");
    await prisma.$disconnect();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup — a lingering handle here doesn't fail the test.
    }

    // Restore the environment and drop the cached sqlite-backed singleton
    // (it points at a now-deleted temp file) so it can't leak into the next
    // test file in this worker.
    vi.unstubAllEnvs();
    clearPrismaSingleton();
    vi.resetModules();
  });

  it("pushes the schema into an ENCRYPTED file at LOCAL_DB_PATH", async () => {
    const key = deriveLocalDbKey(masterKey, deviceId);
    await pushSqliteSchema({ path: dbPath, key });

    // Encrypted: header must NOT be the plaintext SQLite magic string.
    const header = readFileSync(dbPath).subarray(0, 16).toString("latin1");
    expect(header.startsWith("SQLite format 3")).toBe(false);

    // Core table exists, reachable through the SAME resolver the runtime
    // uses — proves push targeted LOCAL_DB_PATH, not just some file.
    const { prisma } = await import("../../config/database");
    await expect(prisma.user.findMany()).resolves.toEqual([]);
  }, 30_000); // `migrate diff` shells out to the prisma CLI — slower than the default 5s.

  it("seeds exactly one SUPER_ADMIN user via the resolved sqlite client", async () => {
    const { prisma } = await import("../../config/database");
    const { seedSuperAdminSqlite } = await import("../seed-super-admin-sqlite");

    await seedSuperAdminSqlite();

    const admins = await prisma.user.findMany({ where: { role: "SUPER_ADMIN" } });
    expect(admins).toHaveLength(1);
    expect(admins[0].email).toBeTruthy();

    // Idempotent — running it again must not create a duplicate.
    await seedSuperAdminSqlite();
    const adminsAfter = await prisma.user.findMany({ where: { role: "SUPER_ADMIN" } });
    expect(adminsAfter).toHaveLength(1);
  });

  it("rejects the pushed+seeded file when opened with the WRONG key", async () => {
    // A deliberately different key from the one the DB was created with
    // (derived from a different master key, same device id).
    const wrongKey = deriveLocalDbKey("a-completely-different-master-key", deviceId);
    expect(wrongKey.equals(deriveLocalDbKey(masterKey, deviceId))).toBe(false);

    // SQLCipher accepts the PRAGMA key unconditionally — it only proves
    // wrong the moment it tries to decrypt an actual page. The shim
    // (src/local/sqlcipher-shim/index.cjs) runs a `journal_mode = WAL`
    // pragma read immediately after keying, in the Database constructor,
    // and Prisma's `PrismaBetterSQLite3AdapterFactory#connect` (a plain,
    // non-async function — see @prisma/adapter-better-sqlite3/dist/index.mjs)
    // constructs that Database synchronously, so the wrong-key rejection (a
    // `SqliteError: file is not a database`) throws synchronously out of
    // `.connect()` itself, rather than surfacing as a rejected Promise.
    expect(() => buildSqliteAdapter({ path: dbPath, key: wrongKey }).connect()).toThrow();
  });
});
