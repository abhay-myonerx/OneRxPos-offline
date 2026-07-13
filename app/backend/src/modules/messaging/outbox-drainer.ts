// 3H.1 messaging — the drainer. Sends DUE MessageLog rows through each tenant's
// transport. Redis-free (a plain function ticked by messaging.scheduler.ts).
//
// Robustness contract (mirrors the SN-3 sync drainer):
//   • Never throws into its caller — the findMany is guarded, every row is
//     guarded, and even the failure-path update is guarded.
//   • A poison row can't head-of-line-block: on failure we increment `attempts`
//     and, at `maxAttempts`, flip to terminal FAILED (dropped from the due set).
//   • Backoff spreads retries so a transient provider outage recovers without
//     hammering.

import { readEmailSettings } from "./messaging.config";
import { resolveTransport as realResolveTransport } from "./transports";
import { logger } from "../../shared/utils/logger";

const BASE_MS = 30_000; // 30s
const CAP_MS = 30 * 60_000; // 30min

/** Next retry time = now + min(BASE * 2^attempts, CAP). Exported for testing. */
export function computeBackoff(attempts: number, now: Date): Date {
  const delay = Math.min(BASE_MS * 2 ** attempts, CAP_MS);
  return new Date(now.getTime() + delay);
}

export interface DrainSummary {
  sent: number;
  failed: number;
  skipped: number;
}

export interface DrainDeps {
  resolveTransportImpl?: typeof realResolveTransport;
  batchSize?: number;
  now?: () => Date;
}

export type TenantResolver = (
  tenantId: string,
) => Promise<{ id: string; encryptionKeyVersion: number; settings: unknown }>;

export async function drainMessages(
  prisma: any,
  tenantResolver: TenantResolver,
  deps: DrainDeps = {},
): Promise<DrainSummary> {
  const resolveTransport = deps.resolveTransportImpl ?? realResolveTransport;
  const now = deps.now ?? (() => new Date());
  const summary: DrainSummary = { sent: 0, failed: 0, skipped: 0 };

  let due: any[];
  try {
    due = await prisma.messageLog.findMany({
      // QUEUED rows are due immediately (nextAttemptAt<=now, set at enqueue).
      // FAILED rows with a future nextAttemptAt are still backing off; terminal
      // FAILED rows have nextAttemptAt=null and are excluded.
      where: {
        status: { in: ["QUEUED", "FAILED"] },
        nextAttemptAt: { not: null, lte: now() },
      },
      orderBy: { queuedAt: "asc" },
      take: deps.batchSize ?? 50,
    });
  } catch (err) {
    logger.error({ err }, "messaging drain: findMany failed");
    return summary;
  }

  for (const row of due) {
    try {
      const tenant = await tenantResolver(row.tenantId);
      const email = readEmailSettings(tenant);
      const resolved = resolveTransport(email, tenant.id, tenant.encryptionKeyVersion);
      if (!resolved) {
        await prisma.messageLog.update({
          where: { id: row.id },
          data: { status: "SKIPPED", lastError: "messaging not configured", nextAttemptAt: null },
        });
        summary.skipped++;
        continue;
      }
      const result = await resolved.transport.send({
        from: resolved.from,
        to: { email: row.toAddress, name: row.toName ?? undefined },
        subject: row.subject,
        html: row.bodyHtml,
        text: row.bodyText ?? undefined,
      });
      await prisma.messageLog.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          sentAt: now(),
          providerMessageId: result.providerMessageId ?? null,
          attempts: row.attempts + 1,
          nextAttemptAt: null,
          lastError: null,
        },
      });
      summary.sent++;
    } catch (err: any) {
      const attempts = row.attempts + 1;
      const terminal = attempts >= row.maxAttempts;
      await prisma.messageLog
        .update({
          where: { id: row.id },
          data: {
            status: terminal ? "FAILED" : "QUEUED",
            attempts,
            lastError: String(err?.message ?? err),
            nextAttemptAt: terminal ? null : computeBackoff(attempts, now()),
          },
        })
        .catch((e: any) => logger.error({ e, id: row.id }, "messaging drain: failure update failed"));
      summary.failed++;
    }
  }
  return summary;
}
