import { Job } from "bullmq";
import type { LowStockJobData } from "../config/queue";
import { notifyLowStock } from "../modules/inventory/reorder.notify";

/**
 * Low stock alert handler (BullMQ). NOTE: as of 3H.2 the auto-reorder trigger
 * runs inline post-checkout (Redis-free, see modules/inventory/reorder.service),
 * so this queue is no longer fed on the hot path. The processor is retained (and
 * shares the exact `notifyLowStock` body) for any future cloud-batch use.
 */
export async function processLowStockAlert(job: Job<LowStockJobData>): Promise<void> {
  await notifyLowStock(job.data);
}
