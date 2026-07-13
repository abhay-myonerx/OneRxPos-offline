import { Job } from "bullmq";
import { prisma } from "../config/database";
import { logger } from "../shared/utils/logger";
import type { DailySnapshotJobData } from "../config/queue";

/**
 * Daily snapshot — runs once per day (typically via a cron scheduler).
 *
 * Captures a point-in-time snapshot of key metrics for each tenant:
 *   - Total sales count and revenue for the day
 *   - Stock reconciliation (compare StockMovement totals vs StoreStock)
 *   - Customer balance totals
 *
 * These snapshots power historical trend charts on the admin dashboard
 * without needing to run expensive aggregate queries over raw data.
 */
export async function processDailySnapshot(job: Job<DailySnapshotJobData>): Promise<void> {
  const { tenantId, date } = job.data;

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);

  logger.info({ tenantId, date }, "Daily snapshot started");

  // ── Sales summary for the day ──────────────────────────────────────────
  const salesAgg = await prisma.sale.aggregate({
    where: {
      tenantId,
      status: { in: ["COMPLETED", "PARTIAL"] },
      createdAt: { gte: dayStart, lte: dayEnd },
    },
    _sum: { grandTotal: true, taxTotal: true, discountAmount: true },
    _count: true,
  });

  // ── Expense total for the day ──────────────────────────────────────────
  const expenseAgg = await prisma.expense.aggregate({
    where: {
      tenantId,
      date: { gte: dayStart, lte: dayEnd },
    },
    _sum: { amount: true },
    _count: true,
  });

  // ── Stock check — flag discrepancies ───────────────────────────────────
  // Count items where StoreStock.quantity might not match the sum of movements.
  // Full reconciliation is expensive, so we just count stock movement entries
  // and store the snapshot for manual review if needed.

  const stockMovements = await prisma.stockMovement.count({
    where: {
      tenantId,
      createdAt: { gte: dayStart, lte: dayEnd },
    },
  });

  // ── Customer due balance snapshot ──────────────────────────────────────
  const customerDues = await prisma.customer.aggregate({
    where: { tenantId, currentBalance: { gt: 0 } },
    _sum: { currentBalance: true },
    _count: true,
  });

  // ── Persist snapshot as audit log ──────────────────────────────────────
  await prisma.auditLog.create({
    data: {
      tenantId,
      action: "system.daily_snapshot",
      entityType: "snapshot",
      entityId: date,
      newData: {
        date,
        sales: {
          count: salesAgg._count,
          revenue: salesAgg._sum.grandTotal?.toString() ?? "0",
          tax: salesAgg._sum.taxTotal?.toString() ?? "0",
          discount: salesAgg._sum.discountAmount?.toString() ?? "0",
        },
        expenses: {
          count: expenseAgg._count,
          total: expenseAgg._sum.amount?.toString() ?? "0",
        },
        stockMovements,
        customerDues: {
          count: customerDues._count,
          totalBalance: customerDues._sum.currentBalance?.toString() ?? "0",
        },
      },
    },
  });

  logger.info(
    {
      tenantId,
      date,
      salesCount: salesAgg._count,
      revenue: salesAgg._sum.grandTotal?.toString() ?? "0",
    },
    "Daily snapshot completed",
  );
}
