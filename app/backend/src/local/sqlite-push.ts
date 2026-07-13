// src/local/sqlite-push.ts
// ─────────────────────────────────────────────────────────────────────────────
// Creates the store-node schema (prisma/schema.sqlite.prisma) inside the
// SQLCipher-encrypted file at LOCAL_DB_PATH — the SAME physical file
// src/config/database.ts opens at runtime (see the path-unification note
// there: LOCAL_DB_PATH, NOT SQLITE_DATABASE_URL, which is only a schema-load
// placeholder for `prisma validate`/`generate`).
//
// Lives under src/local (tsc `rootDir`) rather than scripts/ so it can be
// imported directly by src/local/__tests__/sqlite-push-seed.test.ts without
// tripping TS6059 ("File is not under 'rootDir'") — scripts/ is intentionally
// outside the compiled project (run only via `tsx`, never `tsc`/`npm run
// build`). scripts/push-sqlite-schema.ts is the CLI entrypoint that wraps
// this module for `npm run db:push:sqlite`.
//
// WHY NOT PLAIN `prisma db push`:
// `prisma.sqlite.config.ts` wires Task 1's keyed better-sqlite3 adapter into
// Prisma's JS schema engine, and `db push` through it DOES route every query
// through our SQLCipher shim (verified: DEBUG=prisma:driver-adapter:* shows
// `[js::executeRaw]` calls going through `@prisma/adapter-better-sqlite3`,
// not the native Rust engine). But it still fails — Prisma's sqlite DDL
// generator emits INVALID unquoted JSON literal defaults for `Json
// @default("{}")` / `@default("[]")` fields, e.g.:
//   "settings" JSONB NOT NULL DEFAULT {}      -- SQLite: SQLITE_ERROR
// instead of the quoted `DEFAULT '{}'` SQLite requires. This reproduces
// identically via `prisma migrate diff` (same DDL generator), so it's a
// genuine Prisma engine bug for the sqlite provider — independent of
// encryption — not a "construct sqlite can't express" schema-authoring gap.
//
// WORKAROUND: generate the DDL with `migrate diff --from-empty` (emits SQL
// to stdout with NO DB connection — safe regardless of file/key state),
// patch that one known-bad pattern, then execute the patched script over the
// SAME keyed connection the runtime uses (buildSqliteAdapter, Task 1).
//
// SN-5 Task 2 — NO PRISMA CLI AT RUNTIME: the `migrate diff` shell-out above
// is fine in dev (Prisma CLI installed, `npx` resolvable) but a packaged
// desktop app ships neither. `scripts/generate-sqlite-ddl.ts` runs this SAME
// `generateSqliteDdl` + `fixJsonDefaults` pair once, at BUILD time, and
// writes the result to the committed `prisma/sqlite-schema.sql`.
// `pushSqliteSchema` now APPLIES that pre-generated file (via `opts.ddlSql`,
// `opts.ddlSqlPath`, or the default path next to the schema) whenever it's
// available, and only falls back to the live `migrate diff` shell-out when
// none of those resolve to an existing file — i.e. dev without the artifact.
// The trigger-install step is unaffected: it never shelled to the CLI (it
// only ever parsed `schema.sqlite.prisma` as text, see sync-triggers.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { buildSqliteAdapter } from "./sqlcipher-adapter";
import { buildSyncTriggers, deriveSyncTables } from "./sync-triggers";

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCHEMA_PATH = "prisma/schema.sqlite.prisma";

/**
 * Default location of the BUILD-TIME pre-generated table DDL (SN-5 Task 2):
 * `prisma/sqlite-schema.sql`, written by `scripts/generate-sqlite-ddl.ts`
 * (`npm run db:ddl:sqlite`) using this exact module's `generateSqliteDdl` +
 * `fixJsonDefaults`. Committed to the repo as a deterministic build artifact
 * — see `pushSqliteSchema` below for how it's consumed.
 */
export const DEFAULT_DDL_SQL_PATH = join(REPO_ROOT, "prisma", "sqlite-schema.sql");

/**
 * Prisma's sqlite DDL generator emits bare `{}` / `[]` JSON literal defaults
 * (invalid SQLite syntax — SQLite has no JSON literal token) for `Json
 * @default("{}")` / `@default("[]")` fields. Quote them so SQLite stores the
 * literal as TEXT, matching what Prisma's JSON protocol adapter expects to
 * read back. Exported for direct unit testing of the patch.
 */
export function fixJsonDefaults(sql: string): string {
  const patched = sql.replace(/DEFAULT (\{\}|\[\])/g, "DEFAULT '$1'");

  // Fail loud if any bare (unquoted) JSON literal default survived the patch
  // above — e.g. a future Prisma version changes its DDL output, or a new
  // `Json @default(...)` field with a NON-empty literal (`{"a":1}`, `[1,2]`)
  // is added to the schema. Either would silently reproduce the exact
  // invalid-SQLite-DDL bug this function exists to work around, so we assert
  // the invariant explicitly rather than let it fail later with a confusing
  // SQLITE_ERROR deep inside `executeScript`.
  const unquoted = patched.match(/DEFAULT (\{[^']|\[[^'])/g);
  if (unquoted) {
    throw new Error(
      `fixJsonDefaults: unquoted JSON literal default(s) survived patching — ` +
        `Prisma's sqlite DDL generator output changed or a new non-empty Json ` +
        `default was introduced, and this function's DEFAULT '{}'/'[]' patch ` +
        `no longer covers it: ${unquoted.join(", ")}`,
    );
  }

  return patched;
}

/**
 * Generates the CREATE TABLE / CREATE INDEX DDL for the sqlite schema
 * without opening any database connection — `--from-empty` diffs the schema
 * against nothing, so this is safe to run regardless of whether the target
 * file exists, is encrypted, or is mid-migration.
 */
export function generateSqliteDdl(): string {
  return execSync(
    `npx prisma migrate diff --from-empty --to-schema-datamodel ${SCHEMA_PATH} --script`,
    { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

/**
 * Generates the sync-outbox capture-trigger DDL (SN-3 Task 1) for every
 * syncable table in `prisma/schema.sqlite.prisma`. Read from disk (not
 * imported statically) so it always reflects the CURRENT schema file, the
 * same way `generateSqliteDdl` shells out to `prisma migrate diff` fresh
 * each call rather than embedding a cached DDL string.
 */
export function generateSyncTriggerDdl(): string {
  const schemaSource = readFileSync(join(REPO_ROOT, SCHEMA_PATH), "utf8");
  const tables = deriveSyncTables(schemaSource);
  return buildSyncTriggers(tables);
}

/**
 * Resolves the table DDL to apply, preferring a build-time pre-generated
 * file over the live `prisma migrate diff` shell-out (SN-5 Task 2):
 *
 *  1. `opts.ddlSql` — raw DDL text supplied directly by the caller (e.g. the
 *     packaged desktop app, having read its shipped `extraResources` copy).
 *  2. `opts.ddlSqlPath` — a path to read the DDL from, if that file exists.
 *  3. `DEFAULT_DDL_SQL_PATH` (`prisma/sqlite-schema.sql` next to the
 *     schema), if it exists — the normal case once Task 2's build artifact
 *     is committed/shipped.
 *  4. Otherwise, the live fallback: `generateSqliteDdl()` patched by
 *     `fixJsonDefaults` (dev without the pre-generated artifact).
 *
 * Cases 1–3 are assumed ALREADY patched — they were produced by
 * `fixJsonDefaults` at build time (see `scripts/generate-sqlite-ddl.ts`) —
 * so this function does not re-run the patch over them, only over the
 * live-generated fallback in case 4.
 */
export function resolvePregeneratedOrLiveDdl(opts: { ddlSql?: string; ddlSqlPath?: string }): string {
  if (opts.ddlSql !== undefined) return opts.ddlSql;

  const path = opts.ddlSqlPath ?? DEFAULT_DDL_SQL_PATH;
  if (existsSync(path)) {
    return readFileSync(path, "utf8");
  }

  return fixJsonDefaults(generateSqliteDdl());
}

/**
 * Applies the sqlite schema DDL to the SQLCipher-encrypted file at
 * `opts.path`, keyed with `opts.key`. Mirrors `prisma db push` semantics for
 * a fresh database: statements are plain `CREATE TABLE` / `CREATE INDEX`
 * (not `IF NOT EXISTS`), so this is meant to run once against an empty file.
 *
 * The DDL itself comes from `resolvePregeneratedOrLiveDdl` — the shipped
 * `prisma/sqlite-schema.sql` build artifact when available (no Prisma CLI
 * needed), the live `migrate diff` shell-out otherwise. Pass `ddlSql` /
 * `ddlSqlPath` to point at a packaged copy (e.g. under
 * `process.resourcesPath` once packaged); both are optional and unused in
 * the common case, where the default path next to the schema is checked.
 *
 * Once the tables exist, ALSO installs the generated sync-outbox capture
 * triggers (SN-3 Task 1) on the SAME keyed connection — the triggers
 * reference tables that must already exist, and installing them on this
 * connection (rather than a fresh one) keeps the whole push a single
 * encrypted session. This is the ONLY place the triggers are installed: the
 * Postgres/cloud path never calls this module, so it never gets triggers.
 */
export async function pushSqliteSchema(opts: {
  path: string;
  key: Buffer;
  ddlSql?: string;
  ddlSqlPath?: string;
}): Promise<void> {
  if (opts.path !== ":memory:") {
    mkdirSync(dirname(opts.path), { recursive: true });
  }

  const ddl = resolvePregeneratedOrLiveDdl(opts);
  const triggerDdl = generateSyncTriggerDdl();

  const adapter = await buildSqliteAdapter({ path: opts.path, key: opts.key }).connect();
  try {
    await adapter.executeScript(ddl);
    await adapter.executeScript(triggerDdl);
  } finally {
    await adapter.dispose();
  }
}
