// Pure per-entity conflict-resolution strategies (spec §6.3). No DB access,
// no I/O — these take two already-loaded record snapshots and return the
// resolved record. Dispatch lives in ./registry.

/** A committed transaction (e.g. a sale) is never overwritten. */
export function appendOnly<T>(local: T, _remote: T): T {
  return local;
}

/** The server's copy always wins (safe default for master data). */
export function serverWins<T>(_local: T, remote: T): T {
  return remote;
}

/**
 * Merge two independently-decremented quantities (e.g. store_stock) back
 * onto a common base so both sides' decrements are applied instead of one
 * clobbering the other.
 *
 * When `base` is known, both sides' deltas relative to it are summed:
 *   resolved = base + (local.quantity - base) + (remote.quantity - base)
 *            = local.quantity + remote.quantity - base
 *
 * When `base` is omitted (not tracked), remote's quantity is treated as the
 * base, i.e. only local's delta on top of remote is meaningful:
 *   resolved = local.quantity + remote.quantity - remote.quantity
 */
export function sumOfDecrements<T extends { quantity: number }>(
  local: { quantity: number },
  remote: T,
  base?: number,
): T {
  const effectiveBase = base ?? remote.quantity;
  const quantity = local.quantity + remote.quantity - effectiveBase;
  return { ...remote, quantity };
}

/**
 * Coarse whole-record merge by `updatedAt`: whichever record was updated
 * more recently "wins" for all of its fields, with the other record's
 * fields filling in anything it doesn't have. This is NOT a true per-field
 * merge (that would compare a `${field}UpdatedAt` timestamp per field) —
 * that finer-grained merge is a later refinement (spec §6.3 notes it as
 * such). For Phase 0.4 this whole-record-by-timestamp approximation is
 * sufficient for low-conflict-rate entities like customers.
 */
export function fieldMergeLatestTimestamp<T extends Record<string, unknown>>(
  local: T,
  remote: T,
): T {
  const localUpdatedAt = local.updatedAt as string | Date;
  const remoteUpdatedAt = remote.updatedAt as string | Date;
  if (localUpdatedAt >= remoteUpdatedAt) {
    return { ...remote, ...local };
  }
  return { ...local, ...remote };
}
