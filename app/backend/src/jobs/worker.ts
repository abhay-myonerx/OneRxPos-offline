// BullMQ worker entry point.
// Run separately from the API server:
//   npx tsx src/jobs/worker.ts
//
// In production, deploy as a separate process/container
// so job processing doesn't compete with HTTP request handling.

import { Worker } from "bullmq";
import { bullMQConnection } from "../config/redis";
import { QUEUE_NAMES } from "../config/queue";
import { logger } from "../shared/utils/logger";
import { config } from "../config";

import { processLowStockAlert } from "./lowStockAlert.job";
import { processReportGeneration } from "./reportGeneration.job";
import { processDailySnapshot } from "./dailySnapshot.job";
import { processDemoStockRefill } from "./demoStockRefill.job";
import { processDemoReset } from "./demoReset.job";
import { processSyncPush } from "./sync.processor";
import { processLicenseValidate } from "./license-validate.processor";
import {
  processShiftSwapExpiry,
  processShiftEodReconcile,
  processLeaveMonthlyAccrual,
} from "./hrSweeps.job";
import {
  hrShiftSwapExpiryQueue,
  hrShiftEodReconcileQueue,
  hrLeaveMonthlyAccrualQueue,
} from "../config/queue";

// ── Worker instances ───────────────────────────────────────────────────────────

const workers: Worker[] = [];

function createWorker(
  queueName: string,
  processor: (job: any) => Promise<void>,
  concurrency: number = 3,
): Worker {
  const worker = new Worker(queueName, processor, {
    connection: bullMQConnection,
    concurrency,
  });

  worker.on("completed", (job) => {
    logger.info({ queue: queueName, jobId: job.id }, "Job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ queue: queueName, jobId: job?.id, err }, "Job failed");
  });

  worker.on("error", (err) => {
    logger.error({ queue: queueName, err }, "Worker error");
  });

  workers.push(worker);
  return worker;
}

// ── Start workers ──────────────────────────────────────────────────────────────

logger.info("Starting BullMQ workers...");

createWorker(QUEUE_NAMES.LOW_STOCK, processLowStockAlert, 5);
createWorker(QUEUE_NAMES.REPORT, processReportGeneration, 2);
createWorker(QUEUE_NAMES.DAILY_SNAP, processDailySnapshot, 1);

// HR scheduled sweeps. Each runs at most once at a
// time (concurrency 1) — the sweeps touch every tenant so there's
// no parallelism gain and a single in-flight reduces lock churn.
// The processor functions return result objects for tests/observability
// but the worker signature is `(job) => Promise<void>`. Wrap to drop
// the return values.
createWorker(
  QUEUE_NAMES.HR_SHIFT_SWAP_EXPIRY,
  async (job) => {
    await processShiftSwapExpiry(job);
  },
  1,
);
createWorker(
  QUEUE_NAMES.HR_SHIFT_EOD_RECONCILE,
  async (job) => {
    await processShiftEodReconcile(job);
  },
  1,
);
createWorker(
  QUEUE_NAMES.HR_LEAVE_MONTHLY_ACCRUAL,
  async (job) => {
    await processLeaveMonthlyAccrual(job);
  },
  1,
);

// Repeatable schedules — BullMQ cron patterns:
//   shift-swap expiry: every hour (catches just-expired requests
//                      promptly without hammering the DB)
//   EoD reconcile:    daily at 02:00 UTC for "yesterday"
//   monthly accrual:  1st of every month at 03:00 UTC for the
//                      starting month
//
// Schedules are idempotent — adding the same name twice no-ops.
void hrShiftSwapExpiryQueue.add(
  "hourly-sweep",
  { scheduledAt: new Date().toISOString() },
  { repeat: { pattern: "0 * * * *" } },
);
void hrShiftEodReconcileQueue.add(
  "daily-eod",
  { date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) },
  { repeat: { pattern: "0 2 * * *" } },
);
void hrLeaveMonthlyAccrualQueue.add(
  "monthly-accrual",
  { month: new Date().toISOString().slice(0, 7) },
  { repeat: { pattern: "0 3 1 * *" } },
);

// Sync push worker — drains the local sync_outbox to the cloud.
// Concurrency 1: the drain already batches everything currently pending,
// so a second concurrent run would just contend for the same rows.
createWorker(QUEUE_NAMES.SYNC, processSyncPush, 1);

// Licensing daily re-validation worker. Concurrency 1: only one
// re-validation needs to be in flight at a time. The processor no-ops
// when LICENSE_KEY isn't configured (this till isn't activated).
createWorker(QUEUE_NAMES.LICENSE, processLicenseValidate, 1);

// Invoice worker — placeholder until PDF generation is implemented
createWorker(
  QUEUE_NAMES.INVOICE,
  async (job) => {
    logger.info(
      { saleId: job.data.saleId, tenantId: job.data.tenantId },
      "Invoice PDF generation — not yet implemented",
    );
    // TODO: Render HTML → PDF with Puppeteer, upload to S3/Minio
  },
  2,
);

// Notification worker — placeholder
createWorker(
  QUEUE_NAMES.NOTIFICATION,
  async (job) => {
    logger.info(
      { type: job.data.type, recipientId: job.data.recipientId },
      "Notification — not yet implemented",
    );
    // TODO: Send via email, SMS, WhatsApp, or WebSocket
  },
  5,
);

// Demo workers — only active when DEMO_MODE=true
if (config.DEMO_MODE) {
  createWorker(QUEUE_NAMES.DEMO_REFILL, processDemoStockRefill, 1);
  logger.info("Demo stock refill worker registered");

  // Concurrency 1 ensures at most one reset runs at a time (BullMQ job lock)
  createWorker(QUEUE_NAMES.DEMO_RESET, processDemoReset, 1);
  logger.info("Demo reset worker registered");
}

logger.info(`${workers.length} workers started across ${Object.keys(QUEUE_NAMES).length} queues`);

// ── Graceful shutdown ──────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Worker shutdown signal received");

  await Promise.all(workers.map((w) => w.close()));
  logger.info("All workers closed");

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled rejection in worker");
  process.exit(1);
});
