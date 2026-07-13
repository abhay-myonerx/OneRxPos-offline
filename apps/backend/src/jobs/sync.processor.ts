// Store-node -> cloud sync push job. Wakes up on a BullMQ tick, drains
// whatever is currently pending in the local sync_outbox, and pushes it
// to the cloud via createSyncClient. The job payload carries no data —
// see SyncJobData in ../config/queue.ts.

import { config } from "../config";
import { logger } from "../shared/utils/logger";
import { getLocalDb } from "../local/database";
import { deriveLocalDbKey } from "../local/key-derivation";
import { mintSyncToken } from "../modules/sync/sync-token";
import { createSyncClient, type PostFn } from "../sync/sync-client";

const http: PostFn = async (url, body, token) => {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    accepted?: string[];
    configDeltas?: { entity: string; local: unknown; remote: unknown }[];
  };
  return { status: res.status, body: json };
};

export async function processSyncPush(): Promise<void> {
  // No local DB key configured means the local DB (and therefore the
  // outbox it lives in) isn't in use on this node — nothing to sync.
  if (!config.LOCAL_DB_MASTER_KEY) return;

  const key = deriveLocalDbKey(config.LOCAL_DB_MASTER_KEY, config.SYNC_DEVICE_ID);

  // TODO(0.5+): background jobs don't yet have real per-tenant/store
  // context wired in (this runs outside any HTTP request). Placeholder
  // ids until multi-tenant background job context lands.
  const token = mintSyncToken({
    tenantId: "default",
    storeId: "default",
    deviceId: config.SYNC_DEVICE_ID,
  });

  const db = getLocalDb();
  const result = await createSyncClient({
    db,
    key,
    http,
    cloudUrl: config.CLOUD_SYNC_URL,
    token,
  }).drain();

  logger.info({ pushed: result.pushed, failed: result.failed }, "sync push drain complete");
}
