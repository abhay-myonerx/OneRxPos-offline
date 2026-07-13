// Public SyncClient surface consumed by Phase 1 (offline sales / SYNC job).
// Re-exports only the concrete, stable API.
export { createSyncClient } from "./sync-client";
export type { PostFn } from "./sync-client";

export { resolveConflict } from "./conflict/registry";

export { freshnessFromLastSync } from "./freshness";

export { getPending, markSynced, markFailed, backoffMs } from "./outbox";

export { appendEvent, readEvent } from "./event-log";
export type { EventInput, EventOp } from "./event-log";
