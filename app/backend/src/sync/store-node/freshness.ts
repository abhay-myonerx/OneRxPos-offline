// src/sync/store-node/freshness.ts
// ─────────────────────────────────────────────────────────────────────────────
// SN-3 Task 2 — cheap `sync_outbox` aggregate for a store-node freshness
// indicator (spec §6.3-style "how stale is this till's data"): counts of
// pending/synced rows plus a last-synced timestamp.
//
// `sync_outbox` has no dedicated "synced at" column (only `created_at`, the
// CAPTURE time stamped by the trigger) — `lastSyncedAt` below is therefore
// the `created_at` of the most recently CAPTURED row currently `synced`, used
// as the best available proxy for "how recent is the data this till has
// successfully pushed". This is distinct from `src/sync/freshness.ts`
// (`freshnessFromLastSync`), which buckets an already-known last-sync
// timestamp into green/yellow/red — that helper composes on TOP of the
// `lastSyncedAt` this function returns; it isn't duplicated here.
// ─────────────────────────────────────────────────────────────────────────────
import type { PrismaClient } from "@/generated/prisma/client";

export interface Freshness {
  pending: number;
  synced: number;
  lastSyncedAt: string | null;
}

export async function getFreshness(prisma: PrismaClient): Promise<Freshness> {
  const [pending, synced, mostRecentSynced] = await Promise.all([
    prisma.syncOutbox.count({ where: { status: "pending" } }),
    prisma.syncOutbox.count({ where: { status: "synced" } }),
    prisma.syncOutbox.findFirst({
      where: { status: "synced" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  return {
    pending,
    synced,
    lastSyncedAt: mostRecentSynced ? mostRecentSynced.createdAt.toISOString() : null,
  };
}
