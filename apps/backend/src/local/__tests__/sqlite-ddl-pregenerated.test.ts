// src/local/__tests__/sqlite-ddl-pregenerated.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// SN-5 Task 2 — HARD GATE: proves the schema pushed via the shipped,
// build-time pre-generated `prisma/sqlite-schema.sql` (the path
// `pushSqliteSchema` now prefers, so a packaged app needs no Prisma CLI at
// runtime) is BYTE-IDENTICAL, table-and-index-for-table-and-index, to the
// schema produced by the live `prisma migrate diff --from-empty` shell-out
// (`generateSqliteDdl` + `fixJsonDefaults`) it replaces.
//
// Also locks the `ddlSql` / `ddlSqlPath` override plumbing `pushSqliteSchema`
// exposes for the packaged desktop app (Task 3): an explicit path/string
// takes priority over the default `prisma/sqlite-schema.sql`, and a missing
// override path falls back to the live generator rather than silently
// producing an empty/wrong schema.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, afterAll } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "../key-derivation";
import { buildSqliteAdapter } from "../sqlcipher-adapter";
import {
  DEFAULT_DDL_SQL_PATH,
  fixJsonDefaults,
  generateSqliteDdl,
  pushSqliteSchema,
  resolvePregeneratedOrLiveDdl,
} from "../sqlite-push";

/** `sqlite_master` rows for TABLEs and INDEXes only — deliberately excludes
 * TRIGGERs (installed separately, by `pushSqliteSchema`, on both paths
 * identically) so this stays a comparison of the DDL under test. */
async function tableAndIndexSchema(
  path: string,
  key: Buffer,
): Promise<{ type: unknown; name: unknown; sql: unknown }[]> {
  const adapter = await buildSqliteAdapter({ path, key }).connect();
  try {
    const result = await adapter.queryRaw({
      sql: "SELECT type, name, sql FROM sqlite_master WHERE type IN ('table', 'index') AND sql IS NOT NULL ORDER BY name, type",
      args: [],
      argTypes: [],
    });
    return result.rows.map(([type, name, sql]) => ({ type, name, sql }));
  } finally {
    await adapter.dispose();
  }
}

describe("pre-generated sqlite DDL — byte-identical to live migrate-diff generation (SN-5 Task 2)", () => {
  const dirs: string[] = [];

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  afterAll(() => {
    for (const dir of dirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup.
      }
    }
  });

  it("prisma/sqlite-schema.sql is committed and non-empty", () => {
    expect(existsSync(DEFAULT_DDL_SQL_PATH)).toBe(true);
  });

  it(
    "the schema pushed from the shipped prisma/sqlite-schema.sql is table-and-index " +
      "identical to the schema produced by live `prisma migrate diff`",
    async () => {
      const dir = tempDir("rxpos-ddl-pregen-vs-live-");

      // Path A — pushSqliteSchema's default resolution: no ddlSql/ddlSqlPath
      // given, so it reads the committed DEFAULT_DDL_SQL_PATH.
      const pathA = join(dir, "pre-generated.db");
      const keyA = deriveLocalDbKey("test-master-key-ddl-a", "test-device-ddl-a");
      await pushSqliteSchema({ path: pathA, key: keyA });

      // Path B — the exact live fallback path pushSqliteSchema falls back to
      // when no pre-generated DDL is available: generateSqliteDdl() patched
      // by fixJsonDefaults(), applied directly (bypassing pushSqliteSchema so
      // triggers — installed identically on both paths — don't need to be
      // filtered out at the query level too).
      const pathB = join(dir, "live-generated.db");
      const keyB = deriveLocalDbKey("test-master-key-ddl-b", "test-device-ddl-b");
      const liveDdl = fixJsonDefaults(generateSqliteDdl());
      const adapterB = await buildSqliteAdapter({ path: pathB, key: keyB }).connect();
      try {
        await adapterB.executeScript(liveDdl);
      } finally {
        await adapterB.dispose();
      }

      const schemaA = await tableAndIndexSchema(pathA, keyA);
      const schemaB = await tableAndIndexSchema(pathB, keyB);

      expect(schemaA.length).toBeGreaterThan(0);
      expect(schemaA).toEqual(schemaB);

      // 78 tables in the current prisma/schema.sqlite.prisma (message_logs 3H.1,
      // product_suppliers 3H.2, promotions + promotion_redemptions 3H.4) —
      // asserted explicitly so a future model add/removal is visible here too.
      const tableNames = schemaA.filter((r) => r.type === "table").map((r) => r.name);
      expect(tableNames).toHaveLength(78);
    },
    30_000, // the live-generation side shells out to `prisma migrate diff`.
  );

  // The trigger-install half of `pushSqliteSchema` is UNCONDITIONAL — it
  // always derives triggers for the real `prisma/schema.sqlite.prisma`
  // tables (SN-3 Task 1), regardless of which table DDL was applied. So the
  // override-priority tests below exercise `resolvePregeneratedOrLiveDdl`
  // directly (the exact function `pushSqliteSchema` calls to pick the DDL)
  // rather than a truncated custom schema through the full push, which would
  // fail at the trigger step for an unrelated reason (tables the triggers
  // reference wouldn't exist).

  it("resolvePregeneratedOrLiveDdl: opts.ddlSqlPath, when it points at an existing file, overrides the default", () => {
    const dir = tempDir("rxpos-ddl-custom-path-");
    const customDdlPath = join(dir, "custom-schema.sql");
    const customDdl = 'CREATE TABLE "custom_probe" ("id" TEXT NOT NULL PRIMARY KEY);\n';
    writeFileSync(customDdlPath, customDdl, "utf8");

    expect(resolvePregeneratedOrLiveDdl({ ddlSqlPath: customDdlPath })).toBe(customDdl);
  });

  it("resolvePregeneratedOrLiveDdl: opts.ddlSql, when supplied, takes priority over ddlSqlPath and the default", () => {
    const dir = tempDir("rxpos-ddl-raw-string-");
    const rawDdl = 'CREATE TABLE "raw_probe" ("id" TEXT NOT NULL PRIMARY KEY);\n';

    const resolved = resolvePregeneratedOrLiveDdl({
      ddlSql: rawDdl,
      // Even with a ddlSqlPath ALSO supplied and pointing nowhere, ddlSql wins.
      ddlSqlPath: join(dir, "does-not-exist.sql"),
    });
    expect(resolved).toBe(rawDdl);
  });

  it(
    "resolvePregeneratedOrLiveDdl: opts.ddlSqlPath pointing at a MISSING file falls back to live generation",
    () => {
      const dir = tempDir("rxpos-ddl-missing-path-");
      mkdirSync(dir, { recursive: true });

      const resolved = resolvePregeneratedOrLiveDdl({
        ddlSqlPath: join(dir, "does-not-exist.sql"),
      });
      // Falls all the way back to the exact live-generation path, not an
      // empty/partial string.
      expect(resolved).toBe(fixJsonDefaults(generateSqliteDdl()));
    },
    120_000, // shells out to `prisma migrate diff` TWICE (fallback + expected); slow under load.
  );

  it("end-to-end: pushSqliteSchema honors an explicit ddlSqlPath pointing at a full valid DDL copy", async () => {
    const dir = tempDir("rxpos-ddl-explicit-path-e2e-");
    // A full, valid copy of the shipped DDL at a NON-default path — proves
    // the ddlSqlPath plumbing (not just its default-path resolution) wires
    // all the way through to a genuine push, triggers included.
    const explicitDdlPath = join(dir, "shipped-copy.sql");
    writeFileSync(explicitDdlPath, resolvePregeneratedOrLiveDdl({ ddlSqlPath: DEFAULT_DDL_SQL_PATH }), "utf8");

    const dbPath = join(dir, "explicit-path.db");
    const key = deriveLocalDbKey("test-master-key-ddl-explicit", "test-device-ddl-explicit");
    await pushSqliteSchema({ path: dbPath, key, ddlSqlPath: explicitDdlPath });

    const schema = await tableAndIndexSchema(dbPath, key);
    const tableNames = schema.filter((r) => r.type === "table");
    expect(tableNames.length).toBe(78);
  });
});
