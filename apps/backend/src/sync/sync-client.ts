// Store-node → cloud sync push client. Reads pending sync_outbox rows,
// POSTs them to the cloud, and reconciles the result back into the
// outbox (mark synced, or mark failed with backoff for a retry).
import { logger } from "@/shared/utils/logger";
import type { LocalDatabase } from "@/local/database";
import { getPending, markFailed, markSynced } from "./outbox";
import { readEvent } from "./event-log";
import { resolveConflict } from "./conflict/registry";
import type { EventEnvelope } from "@/modules/sync/sync.validation";

export type PostFn = (
  url: string,
  body: { events: EventEnvelope[] },
  token: string,
) => Promise<{
  status: number;
  body: {
    accepted?: string[];
    configDeltas?: { entity: string; local: unknown; remote: unknown }[];
  };
}>;

export interface SyncClientDeps {
  db: LocalDatabase;
  key: Buffer;
  http: PostFn;
  cloudUrl: string;
  token: string;
}

export interface DrainResult {
  pushed: number;
  failed: number;
}

export function createSyncClient(deps: SyncClientDeps): {
  drain(now?: number): Promise<DrainResult>;
} {
  const { db, key, http, cloudUrl, token } = deps;

  async function drain(now: number = Date.now()): Promise<DrainResult> {
    const pending = getPending(db, now, 100);
    if (pending.length === 0) return { pushed: 0, failed: 0 };

    const events: EventEnvelope[] = pending
      .map(({ eventId }) => {
        const e = readEvent(db, key, eventId);
        if (!e) return null;
        return { id: eventId, entity: e.entity, entityId: e.entityId, op: e.op, data: e.data };
      })
      .filter((e): e is EventEnvelope => e !== null);

    let res: Awaited<ReturnType<PostFn>>;
    try {
      res = await http(`${cloudUrl}/push`, { events }, token);
    } catch (err) {
      for (const e of events) markFailed(db, e.id, String(err), now);
      return { pushed: 0, failed: events.length };
    }

    if (res.status >= 200 && res.status < 300) {
      const accepted = res.body.accepted ?? events.map((e) => e.id);
      markSynced(db, accepted);

      // Conflict deltas returned by the cloud are resolved here so the
      // resolution strategy runs, but actually applying/mirror-writing
      // the resolved record back into local tables is deferred to a
      // later phase (Phase 0.5+) once the local store has generic
      // upsert-by-entity support.
      for (const delta of res.body.configDeltas ?? []) {
        const resolved = resolveConflict(delta.entity, delta.local, delta.remote);
        logger.info({ entity: delta.entity, resolved }, "sync: resolved config conflict");
      }

      return { pushed: accepted.length, failed: 0 };
    }

    for (const e of events) markFailed(db, e.id, `HTTP ${res.status}`, now);
    return { pushed: 0, failed: events.length };
  }

  return { drain };
}
