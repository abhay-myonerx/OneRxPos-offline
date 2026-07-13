// src/local/sync-triggers.ts
// ─────────────────────────────────────────────────────────────────────────────
// Core (pure, DB-connection-free) logic behind the store-node sync-outbox
// capture triggers (SN-3 Task 1): `buildSyncTriggers` emits the `CREATE
// TRIGGER` DDL for a table+pk list, and `deriveSyncTables` derives that list
// by parsing `prisma/schema.sqlite.prisma`.
//
// Lives under src/local (tsc `rootDir`) — NOT scripts/ — for the same reason
// `sqlite-push.ts` does (see that file's header comment): `src/local/sqlite-push.ts`
// needs to import this to install the triggers on the SAME keyed connection
// right after the schema DDL at push time, and a `src/**` file importing from
// `scripts/**` (which is intentionally excluded from the tsc project, run
// only via `tsx`) trips TS6059 ("File is not under 'rootDir'").
// `scripts/generate-sync-triggers.ts` is the CLI entrypoint: it re-exports
// this module's public API (so `scripts/__tests__/generate-sync-triggers.test.ts`
// can import `buildSyncTriggers` from it directly, per the SN-3 Task 1 spec)
// and adds a `main()` that prints the DDL for the real schema to stdout.
//
// Every syncable tenant-owned table gets 3 triggers that insert a row into
// `sync_outbox` — atomically, as part of the SAME SQLite transaction as the
// domain write (spike-verified, SN-3 Task 0). A rolled-back transaction rolls
// the outbox row back with it.
//
// This is GENERATED DDL, not hand-maintained — like `derive-sqlite-schema.ts`,
// extend it (and its test) rather than hand-editing the emitted SQL anywhere
// it's consumed.
// ─────────────────────────────────────────────────────────────────────────────
import { DIRECT_TENANT_MODELS, CHILD_MODEL_PARENT_RELATION } from "../config/database";

export interface SyncTable {
  table: string;
  pk: string;
  /**
   * The Prisma model name (e.g. "User") owning this table — added for SN-3
   * Task 2 (the outbox drainer), which needs to resolve a captured `entity`
   * (table name) back to a `prisma[delegate]` call. `buildSyncTriggers` does
   * not read this field; it only consumes `table`/`pk`.
   */
  model: string;
  /**
   * The Prisma FIELD name (not necessarily the DB column name) backing the
   * model's `@id` scalar — e.g. `userId` for `UserPin.userId @map("user_id")`.
   * `pk` above is the DB COLUMN name (used for trigger SQL, `NEW.<pk>`); this
   * is the JS-side field name the Prisma Client API expects in a
   * `findUnique({ where: { [pkField]: ... } })` call. They differ only when
   * the `@id` field carries its own `@map(...)`.
   */
  pkField: string;
}

/**
 * Pure DDL generator: table+pk pairs → `CREATE TRIGGER` statements, 3 per
 * table (AFTER INSERT / AFTER UPDATE / AFTER DELETE), each inserting a row
 * into `sync_outbox`. INSERT/UPDATE use `NEW.<pk>`; DELETE uses `OLD.<pk>`
 * (the only row image SQLite exposes for a deleted row).
 *
 * The trigger explicitly stamps `created_at` via `datetime('now')` (rather
 * than relying on the column's SQL DEFAULT) to match the exact shape proven
 * by the SN-3 spike; `status`/`attempts`/`next_attempt_at`/`last_error` are
 * omitted from the INSERT so they fall through to the column defaults
 * ('pending' / 0 / NULL / NULL) declared on the `SyncOutbox` Prisma model.
 */
// Only `table` + `pk` are needed to emit the DDL; accept the narrow shape so
// callers/tests aren't forced to supply the drainer-only `model`/`pkField`.
export function buildSyncTriggers(tables: Pick<SyncTable, "table" | "pk">[]): string {
  return tables.map((t) => buildTableTriggers(t)).join("\n");
}

function buildTableTriggers({ table, pk }: Pick<SyncTable, "table" | "pk">): string {
  const ops: { suffix: string; event: string; op: string; rowRef: "NEW" | "OLD" }[] = [
    { suffix: "ai", event: "INSERT", op: "insert", rowRef: "NEW" },
    { suffix: "au", event: "UPDATE", op: "update", rowRef: "NEW" },
    { suffix: "ad", event: "DELETE", op: "delete", rowRef: "OLD" },
  ];

  return ops
    .map(
      ({ suffix, event, op, rowRef }) => `CREATE TRIGGER ${table}_sync_${suffix} AFTER ${event} ON ${table} BEGIN
  INSERT INTO sync_outbox (id, entity, entity_id, op, created_at)
  VALUES (lower(hex(randomblob(16))), '${table}', ${rowRef}.${pk}, '${op}', datetime('now'));
END;`,
    )
    .join("\n");
}

// ─── Syncable table derivation ──────────────────────────────────────────────

/** Matches a `model Name {` opening — used only to locate the START of each block. */
const MODEL_START_RE = /model\s+(\w+)\s*\{/g;

/**
 * Extracts every top-level `model Name { ... }` block from a schema source,
 * keyed by model name, using brace-DEPTH matching rather than a naive
 * `[^}]*` regex. This matters because Json field defaults like
 * `@default("{}")` / `@default("[]")` embed LITERAL `{`/`}` characters
 * inside a quoted string well before the model's real closing brace (e.g.
 * `Tenant.settings Json @default("{}")` appears long before `Tenant`'s
 * `@@map("tenants")`) — a regex that stops at the first quote-unaware `}`
 * would silently truncate the body and miss the `@@map`/`@id` lines that
 * come after it.
 */
function extractModelBlocks(src: string): Map<string, string> {
  const blocks = new Map<string, string>();
  MODEL_START_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MODEL_START_RE.exec(src)) !== null) {
    const name = match[1];
    const bodyStart = MODEL_START_RE.lastIndex; // just past the opening '{'
    const bodyEnd = findMatchingBrace(src, bodyStart);
    blocks.set(name, src.slice(bodyStart, bodyEnd));
    MODEL_START_RE.lastIndex = bodyEnd + 1;
  }

  return blocks;
}

/**
 * Given a position just after an opening `{` (depth already 1), returns the
 * index of the matching closing `}`, skipping over any `{`/`}` that appear
 * inside a double-quoted string literal.
 */
function findMatchingBrace(src: string, openIndex: number): number {
  let depth = 1;
  let inString = false;

  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i];

    if (inString) {
      if (ch === '"' && src[i - 1] !== "\\") inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }

  throw new Error(
    `sync-triggers: unbalanced braces in schema starting at index ${openIndex} — ` +
      "could not find the matching closing brace for a model block.",
  );
}

/** Matches the model's `@@map("table_name")` attribute. */
const MAP_RE = /@@map\("([^"]+)"\)/;

/** Matches a scalar field carrying `@id` (NOT a `@@id([...])` compound key line). */
const ID_FIELD_RE = /^\s*(\w+)\s+\w+\??\s+.*\B@id\b.*$/m;

/** Matches an optional `@map("column_name")` on the same field line as `@id`. */
const ID_FIELD_MAP_RE = /@map\("([^"]+)"\)/;

/**
 * Parses `prisma/schema.sqlite.prisma` and resolves each syncable model name
 * (from the tenant-scoping lists in `src/config/database.ts`) to its
 * `{ table, pk }` pair — the DB table name from `@@map` and the DB column
 * name backing the model's scalar `@id` field (its own `@map`, if present,
 * else the field name itself).
 *
 * A model with a COMPOUND primary key (`@@id([...])`, no single scalar `@id`
 * field) has no single column a trigger can stash into `entity_id` — it is
 * skipped with a console warning rather than silently mis-capturing. As of
 * SN-3 Task 1 the only such model is `ProductLevy`.
 */
export function deriveSyncTables(schemaSource: string): SyncTable[] {
  const normalized = schemaSource.replace(/\r\n/g, "\n");
  const syncableModels = new Set<string>([
    ...DIRECT_TENANT_MODELS,
    ...Object.keys(CHILD_MODEL_PARENT_RELATION),
  ]);
  // SyncOutbox itself is never captured — it's the destination, not a source.
  syncableModels.delete("SyncOutbox");

  const modelsByName = extractModelBlocks(normalized);

  const results: SyncTable[] = [];
  for (const modelName of syncableModels) {
    const body = modelsByName.get(modelName);
    if (!body) {
      console.warn(
        `sync-triggers: model "${modelName}" not found in schema.sqlite.prisma — skipping.`,
      );
      continue;
    }

    const mapMatch = body.match(MAP_RE);
    if (!mapMatch) {
      console.warn(`sync-triggers: model "${modelName}" has no @@map(...) — skipping.`);
      continue;
    }
    const table = mapMatch[1];

    const idFieldMatch = body.match(ID_FIELD_RE);
    if (!idFieldMatch) {
      console.warn(
        `sync-triggers: model "${modelName}" has no single scalar @id field ` +
          `(likely a compound @@id key) — skipping; it cannot be captured by a single-column trigger.`,
      );
      continue;
    }

    const idFieldLine = idFieldMatch[0];
    const fieldName = idFieldMatch[1];
    const fieldMapMatch = idFieldLine.match(ID_FIELD_MAP_RE);
    const pk = fieldMapMatch ? fieldMapMatch[1] : fieldName;

    results.push({ table, pk, model: modelName, pkField: fieldName });
  }

  // Stable, deterministic ordering — Set iteration order is insertion order,
  // but sort anyway so the emitted DDL diffs cleanly across regenerations.
  results.sort((a, b) => a.table.localeCompare(b.table));
  return results;
}
