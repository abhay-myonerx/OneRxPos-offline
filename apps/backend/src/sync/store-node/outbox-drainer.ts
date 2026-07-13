// src/sync/store-node/outbox-drainer.ts
// ─────────────────────────────────────────────────────────────────────────────
// SN-3 Task 2 — the store-node outbox DRAINER: reads `sync_outbox` rows
// captured atomically by the triggers installed in SN-3 Task 1
// (src/local/sync-triggers.ts, src/local/sqlite-push.ts), fetches each row's
// CURRENT data via Prisma, encrypts the payload at drain time (`encryptEvent`
// — never at capture time), and best-effort POSTs a batch to the cloud
// `/sync` endpoint.
//
// Offline-first invariant: with no `deps.cloudUrl` configured, this
// immediately no-ops — the outbox just accumulates and the store-node stays
// fully functional. `drainOutbox` NEVER throws: a push failure marks the
// batch `failed`-with-backoff (reusing `backoffMs` from `src/sync/outbox.ts`,
// the same curve the OLD raw-better-sqlite3 event-log drainer uses) and
// returns normally — a bad network tick must not crash the caller (a
// `setInterval` in store-node boot, wired in SN-3 Task 3).
//
// Boot wiring (minting the store-node JWT via
// `src/modules/sync/sync-token.ts` and reading `config.SYNC_CLOUD_URL`) is
// deliberately NOT done here — `deps.cloudUrl`/`deps.token` are passed in by
// the caller (SN-3 Task 3), keeping this module pure of config/boot concerns
// and trivially testable with stub deps.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";
import { deriveSyncTables, type SyncTable } from "@/local/sync-triggers";
import { encryptEvent } from "@/local/event-crypto";
import { backoffMs } from "@/sync/outbox";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const SCHEMA_PATH = join(REPO_ROOT, "prisma", "schema.sqlite.prisma");

export interface DrainDeps {
  /** Cloud sync base URL. When unset, `drainOutbox` no-ops (offline). */
  cloudUrl?: string;
  /** Store-node bearer JWT (minted by `src/modules/sync/sync-token.ts`). */
  token?: string;
  /** AES-256-GCM key `encryptEvent`/`decryptEvent` use to wrap each payload. */
  key: Buffer;
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected clock (ms epoch) for deterministic backoff assertions. */
  now?: number;
  /** Max pending rows read per drain tick. Defaults to 100. */
  batch?: number;
}

export interface DrainResult {
  pushed: number;
  failed: number;
}

type PendingRow = {
  id: string;
  entity: string;
  entityId: string;
  op: string;
  attempts: number;
};

/**
 * Resolves `entity` (the DB table name a trigger stamped, e.g. `"users"`) to
 * its Prisma model+pk-field pair by parsing `prisma/schema.sqlite.prisma` via
 * the SAME `deriveSyncTables` Task 1 uses to generate the trigger DDL — one
 * source of truth for "which tables are syncable and what identifies a row".
 * Re-read (not module-level cached) on every call, mirroring
 * `generateSyncTriggerDdl` in `src/local/sqlite-push.ts`: this file is tiny
 * and drains run on a slow interval, so freshness beats the marginal cost of
 * re-parsing.
 */
function loadTableMap(): Map<string, SyncTable> {
  const schemaSource = readFileSync(SCHEMA_PATH, "utf8");
  const tables = deriveSyncTables(schemaSource);
  return new Map(tables.map((t) => [t.table, t]));
}

/** `"SaleItem"` -> `"saleItem"` — the Prisma Client delegate property name. */
function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * Fetches the CURRENT row for an insert/update event via
 * `prisma[delegate].findUnique(...)`. Returns `null` for `delete` ops, for
 * an entity this store-node doesn't recognize (schema drift), or if the row
 * was since deleted (findUnique legitimately returns null) — every case ships
 * `data: null` rather than throwing, since a delete-in-the-meantime is a
 * normal race, not an error.
 */
async function resolveRowData(
  prisma: PrismaClient,
  tableMap: Map<string, SyncTable>,
  row: PendingRow,
): Promise<unknown> {
  if (row.op === "delete") return null;

  const table = tableMap.get(row.entity);
  if (!table) return null;

  const delegate = delegateName(table.model);
  const client = prisma as unknown as Record<
    string,
    { findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown> }
  >;
  const model = client[delegate];
  if (!model || typeof model.findUnique !== "function") return null;

  try {
    return await model.findUnique({ where: { [table.pkField]: row.entityId } });
  } catch {
    // Best-effort: a lookup failure (e.g. malformed pk) must not abort the
    // whole batch — ship the event with null data rather than dropping it.
    return null;
  }
}

/** Marks a batch of rows `pending` with incremented attempts + backoff. */
async function markAllFailed(
  prisma: PrismaClient,
  rows: PendingRow[],
  now: number,
  error: string,
): Promise<void> {
  await Promise.all(
    rows.map((row) => {
      const attempts = row.attempts + 1;
      const nextAttemptAt = new Date(now + backoffMs(attempts));
      return prisma.syncOutbox.update({
        where: { id: row.id },
        data: { attempts, nextAttemptAt, lastError: error },
      });
    }),
  );
}

/**
 * Reads pending `sync_outbox` rows, encrypts each at drain time, POSTs a
 * single batch to `${cloudUrl}/sync`, and marks the batch `synced` (2xx) or
 * `pending`-with-backoff (non-2xx / throw). Never throws — best-effort.
 */
export async function drainOutbox(prisma: PrismaClient, deps: DrainDeps): Promise<DrainResult> {
  if (!deps.cloudUrl) {
    // Offline / not configured — the outbox accumulates, no-op.
    return { pushed: 0, failed: 0 };
  }

  const now = deps.now ?? Date.now();
  const batch = deps.batch ?? 100;
  const fetchFn = deps.fetchImpl ?? fetch;

  let pending: PendingRow[];
  try {
    pending = await prisma.syncOutbox.findMany({
      where: {
        status: "pending",
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date(now) } }],
      },
      orderBy: { createdAt: "asc" },
      take: batch,
      select: { id: true, entity: true, entityId: true, op: true, attempts: true },
    });
  } catch {
    // Can't even read the outbox — nothing to push, nothing to mark failed.
    return { pushed: 0, failed: 0 };
  }

  if (pending.length === 0) {
    return { pushed: 0, failed: 0 };
  }

  try {
    const tableMap = loadTableMap();

    const events = await Promise.all(
      pending.map(async (row) => {
        const data = await resolveRowData(prisma, tableMap, row);
        const payload = JSON.stringify({
          entity: row.entity,
          entityId: row.entityId,
          op: row.op,
          data,
        });
        return {
          id: row.id,
          entity: row.entity,
          op: row.op,
          payload: encryptEvent(payload, deps.key),
        };
      }),
    );

    const res = await fetchFn(`${deps.cloudUrl}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(deps.token ? { Authorization: `Bearer ${deps.token}` } : {}),
      },
      body: JSON.stringify({ events }),
    });

    if (res.ok) {
      await prisma.syncOutbox.updateMany({
        where: { id: { in: pending.map((r) => r.id) } },
        data: { status: "synced" },
      });
      return { pushed: pending.length, failed: 0 };
    }

    await markAllFailed(prisma, pending, now, `HTTP ${res.status}`);
    return { pushed: 0, failed: pending.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await markAllFailed(prisma, pending, now, message);
    } catch {
      // Best-effort even in the failure path — swallow, never throw out of drainOutbox.
    }
    return { pushed: 0, failed: pending.length };
  }
}
