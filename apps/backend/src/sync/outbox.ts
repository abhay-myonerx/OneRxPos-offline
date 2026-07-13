import type { LocalDatabase } from "@/local/database";

// Exponential backoff capped at 5 minutes, pure of DB/clock so it is trivial
// to unit test and reuse for both scheduling and assertions in tests.
export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** attempts, 300_000);
}

export function getPending(db: LocalDatabase, now: number, limit: number): { eventId: string }[] {
  return db
    .prepare(
      "SELECT eventId FROM sync_outbox WHERE status = 'pending' AND (nextAttemptAt IS NULL OR nextAttemptAt <= ?) ORDER BY rowid ASC LIMIT ?",
    )
    .all(now, limit) as { eventId: string }[];
}

export function markSynced(db: LocalDatabase, ids: string[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`UPDATE sync_outbox SET status = 'synced' WHERE eventId IN (${placeholders})`).run(
    ...ids,
  );
}

export function markFailed(db: LocalDatabase, id: string, error: string, now: number): void {
  const row = db.prepare("SELECT attempts FROM sync_outbox WHERE eventId = ?").get(id) as
    { attempts: number } | undefined;
  const newAttempts = (row?.attempts ?? 0) + 1;
  const nextAttemptAt = now + backoffMs(newAttempts);
  db.prepare(
    "UPDATE sync_outbox SET attempts = ?, nextAttemptAt = ?, lastError = ? WHERE eventId = ?",
  ).run(newAttempts, nextAttemptAt, error, id);
}
