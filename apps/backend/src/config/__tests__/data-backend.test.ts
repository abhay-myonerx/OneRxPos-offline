import { describe, it, expect, afterEach, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The Prisma singleton in `src/config/database.ts` is cached on
// `globalThis.prisma` outside NODE_ENV==="production" (hot-reload
// preservation). `vi.resetModules()` alone only clears vitest's module
// registry — it does NOT touch globalThis — so we also delete the cached
// instance ourselves before each re-import to force a fresh client build
// against the freshly-stubbed env.
type GlobalWithPrisma = typeof globalThis & { prisma?: unknown };

function clearPrismaSingleton(): void {
  delete (globalThis as GlobalWithPrisma).prisma;
}

describe("DATA_BACKEND=sqlite resolver", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    vi.unstubAllEnvs();
    clearPrismaSingleton();
    vi.resetModules();
    if (tmpDir) {
      // Best-effort: on Windows the sqlite WAL/SHM handles can linger briefly
      // after $disconnect() before the OS releases the file lock.
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore — temp dir, not asserted on
      }
      tmpDir = undefined;
    }
  });

  it("resolves a keyed SQLCipher client and executes a query", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "rxpos-data-backend-"));
    const dbPath = join(tmpDir, "store-node.db");

    vi.resetModules();
    clearPrismaSingleton();
    vi.stubEnv("DATA_BACKEND", "sqlite");
    vi.stubEnv(
      "LOCAL_DB_MASTER_KEY",
      "test-data-backend-master-key-0123456789abcdef0123456789abcdef",
    );
    vi.stubEnv("LOCAL_DB_PATH", dbPath);

    const { prisma: client } = await import("../database");

    const rows = await client.$queryRawUnsafe<{ one: number | bigint }[]>("SELECT 1 AS one");
    // The better-sqlite3 driver adapter returns INTEGER columns as BigInt.
    expect(Number(rows[0].one)).toBe(1);

    // Force a write so the file is guaranteed to have persisted content —
    // an empty just-opened SQLite file can still be 0 bytes.
    await client.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS _sn1_probe (id INTEGER PRIMARY KEY)");

    await client.$disconnect();

    expect(existsSync(dbPath)).toBe(true);
    const header = readFileSync(dbPath).subarray(0, 16).toString("latin1");
    // Plaintext SQLite files start with the literal magic string
    // "SQLite format 3\0". A SQLCipher-keyed file's header is ciphertext.
    expect(header.startsWith("SQLite format 3")).toBe(false);
  });

  it("throws a clear error when LOCAL_DB_MASTER_KEY is unset", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "rxpos-data-backend-"));
    const dbPath = join(tmpDir, "store-node.db");

    vi.resetModules();
    clearPrismaSingleton();
    vi.stubEnv("DATA_BACKEND", "sqlite");
    vi.stubEnv("LOCAL_DB_MASTER_KEY", "");
    vi.stubEnv("LOCAL_DB_PATH", dbPath);

    await expect(import("../database")).rejects.toThrow(/LOCAL_DB_MASTER_KEY/);
  });

  it("regression: DATA_BACKEND=postgres (default) still resolves the Postgres client type", async () => {
    vi.resetModules();
    clearPrismaSingleton();
    vi.stubEnv("DATA_BACKEND", "postgres");
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");

    const { prisma: client } = await import("../database");
    expect(client).toBeDefined();
    expect(typeof client.$queryRawUnsafe).toBe("function");
  });
});
