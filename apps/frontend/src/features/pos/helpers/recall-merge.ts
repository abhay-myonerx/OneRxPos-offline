import type { ParkedSaleRecord } from "../types/parked-sale.types";

/**
 * Merge the device's local IndexedDB holds with the backend's store-scoped
 * list into one deduped recall list (Phase 1.3b, Approach A).
 *
 * Dedupe is by `id` (the client-generated key shared by a hold and its mirror).
 * When a hold appears in BOTH lists, the remote copy wins: it marks the record
 * as `remote`-backed so `resume` knows it must `claim` it (the cross-till
 * single-claim guard) before restoring. A hold that never synced (e.g. parked
 * offline) stays `local` and can be resumed without a remote round-trip.
 *
 * Sorted newest-first for display.
 */
export function mergeRecallList(
  local: ParkedSaleRecord[],
  remote: ParkedSaleRecord[],
): ParkedSaleRecord[] {
  const byId = new Map<string, ParkedSaleRecord>();

  for (const rec of local) {
    byId.set(rec.id, { ...rec, origin: "local" });
  }
  for (const rec of remote) {
    // Remote is the durable, claim-guarded copy — it overrides a local entry
    // of the same id and flags the record as needing a backend claim.
    byId.set(rec.id, { ...rec, origin: "remote" });
  }

  return [...byId.values()].sort(
    (a, b) => new Date(b.parkedAt).getTime() - new Date(a.parkedAt).getTime(),
  );
}
