// src/sync/store-node/drain-scheduler.ts
// ─────────────────────────────────────────────────────────────────────────────
// SN-3 Task 3 — boots the best-effort outbox drainer (Task 2's `drainOutbox`)
// on a `setInterval` when the store-node is configured to talk to a cloud.
//
// `shouldScheduleDrain()` is the single gate: sqlite backend + a cloud URL +
// a master key to derive the local DB key from. Any one missing and this
// returns false — the outbox just accumulates offline, which is the whole
// point of the store-node's offline-first design (see outbox-drainer.ts).
//
// `startDrainScheduler` mints the store-node's cloud bearer token once (via
// `mintSyncToken`) and derives the AES key once (via `deriveLocalDbKey`),
// then ticks `drainOutbox` on an interval. The tenant/store identity used to
// mint the token is a placeholder ("default"/"default") — this mirrors the
// existing placeholder in `src/jobs/sync.processor.ts`: boot/background
// contexts don't yet have real per-tenant/store context wired in (no HTTP
// request to resolve it from). A single store-node serves a single
// tenant+store, so this is safe until multi-tenant store-node context lands
// (tracked alongside the sync.processor.ts TODO).
// ─────────────────────────────────────────────────────────────────────────────
import type { PrismaClient } from "@/generated/prisma/client";
import { config } from "@/config";
import { logger } from "@/shared/utils/logger";
import { deriveLocalDbKey } from "@/local/key-derivation";
import { mintSyncToken } from "@/modules/sync/sync-token";
import { drainOutbox } from "./outbox-drainer";

const DEFAULT_INTERVAL_MS = 30_000;

/**
 * True only when the store-node is running the sqlite backend AND has a
 * cloud URL to drain to AND a master key to derive the local DB key from.
 * Otherwise the outbox just accumulates — that's fine, offline-first.
 */
export function shouldScheduleDrain(): boolean {
  return (
    config.DATA_BACKEND === "sqlite" && !!config.SYNC_CLOUD_URL && !!config.LOCAL_DB_MASTER_KEY
  );
}

export interface DrainSchedulerOptions {
  /** Drain tick interval in ms. Defaults to 30s. */
  intervalMs?: number;
  /** Injected for tests; forwarded to `drainImpl`'s `fetchImpl` dep. */
  fetchImpl?: typeof fetch;
  /** Injected for tests so a spy can stand in for the real `drainOutbox`. */
  drainImpl?: typeof drainOutbox;
}

/**
 * Starts the best-effort drain interval: an immediate first drain, then one
 * every `intervalMs`. Returns a `stop()` that clears the interval.
 *
 * Callers MUST only invoke this when `shouldScheduleDrain()` is true — this
 * function does not re-check config itself (it needs `LOCAL_DB_MASTER_KEY`
 * to derive the key, which `deriveLocalDbKey` throws on if empty).
 */
export function startDrainScheduler(
  prisma: PrismaClient,
  opts: DrainSchedulerOptions = {},
): () => void {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const drain = opts.drainImpl ?? drainOutbox;

  const key = deriveLocalDbKey(config.LOCAL_DB_MASTER_KEY ?? "", config.SYNC_DEVICE_ID);
  const token = mintSyncToken({
    tenantId: "default",
    storeId: "default",
    deviceId: config.SYNC_DEVICE_ID,
  });

  const tick = (): void => {
    // `drainOutbox` already never throws (it's best-effort internally), but
    // this scheduler tick guards anyway — a tick must never crash the
    // process or stop future ticks.
    Promise.resolve(
      drain(prisma, {
        cloudUrl: config.SYNC_CLOUD_URL,
        token,
        key,
        fetchImpl: opts.fetchImpl,
      }),
    ).catch((err) => {
      logger.error({ err }, "store-node: drain scheduler tick failed unexpectedly");
    });
  };

  tick(); // immediate first drain on start

  const interval = setInterval(tick, intervalMs);
  interval.unref(); // never keeps the process alive on its own

  return () => clearInterval(interval);
}
