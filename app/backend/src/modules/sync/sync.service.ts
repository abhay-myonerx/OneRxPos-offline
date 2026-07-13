import type { EventEnvelope } from "./sync.validation";
import type { SyncContext } from "./sync-token";

// STUB — Phase 0.4 only wires the authenticated transport. Actually applying
// pushed events against the cloud database (conflict resolution, tenant/store
// scoping, config-delta computation) is real work for a later phase. For now
// this just echoes back the accepted event ids so the store-node client can
// mark its outbox rows as synced.
export function applyPush(
  events: EventEnvelope[],
  _ctx: SyncContext,
): { accepted: string[]; configDeltas: unknown[] } {
  return { accepted: events.map((e) => e.id), configDeltas: [] };
}
