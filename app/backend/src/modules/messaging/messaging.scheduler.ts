// 3H.1 messaging — the boot scheduler. Ticks `drainMessages` on an interval.
// Modeled on src/sync/store-node/drain-scheduler.ts: an immediate first drain,
// then every `intervalMs`; the interval is `.unref()`'d so it NEVER holds the
// process open, and each tick swallows its own errors so a bad drain can't crash
// the process or stop future ticks. Redis-free — safe on cloud AND store-node.

import { drainMessages } from "./outbox-drainer";
import type { TenantResolver } from "./outbox-drainer";
import { logger } from "../../shared/utils/logger";

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Messaging is Redis-free and correct on both cloud and store-node, so it always
 * schedules. (A single always-true gate keeps one boot seam like the sync
 * scheduler; the drainer no-ops cheaply when nothing is due.)
 */
export function shouldScheduleMessaging(): boolean {
  return true;
}

/** Default resolver: loads a tenant's settings + key version by id. */
export function defaultTenantResolver(prisma: any): TenantResolver {
  return async (tenantId: string) => {
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, encryptionKeyVersion: true, settings: true },
    });
    return t ?? { id: tenantId, encryptionKeyVersion: 1, settings: {} };
  };
}

export interface MessagingSchedulerOptions {
  intervalMs?: number;
  drainImpl?: typeof drainMessages;
}

export function startMessagingScheduler(
  prisma: any,
  tenantResolver: TenantResolver,
  opts: MessagingSchedulerOptions = {},
): () => void {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const drain = opts.drainImpl ?? drainMessages;

  const tick = (): void => {
    Promise.resolve(drain(prisma, tenantResolver)).catch((err) =>
      logger.error({ err }, "messaging scheduler tick failed unexpectedly"),
    );
  };

  tick(); // immediate first drain on start

  const interval = setInterval(tick, intervalMs);
  interval.unref(); // never keeps the process alive on its own

  return () => clearInterval(interval);
}
