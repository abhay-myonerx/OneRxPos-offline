import { Queue, QueueOptions } from "bullmq";
import { bullMQConnection } from "./redis";

// ─── Shared Queue Options ──────────────────────────────────────────────────────

const DEFAULT_QUEUE_OPTIONS: QueueOptions = {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000, // 2s → 4s → 8s
    },
    removeOnComplete: {
      age: 60 * 60 * 24, // Keep completed jobs for 24 hours
      count: 500, // Keep max 500 completed jobs
    },
    removeOnFail: {
      age: 60 * 60 * 24 * 7, // Keep failed jobs for 7 days
    },
  },
};

export const QUEUE_NAMES = {
  INVOICE: "invoice",
  REPORT: "report",
  LOW_STOCK: "low-stock",
  DAILY_SNAP: "daily-snapshot",
  NOTIFICATION: "notification",
  DEMO_REFILL: "demo-stock-refill",
  DEMO_RESET: "demo-reset",
  // HR scheduled jobs.
  HR_SHIFT_SWAP_EXPIRY: "hr-shift-swap-expiry",
  HR_SHIFT_EOD_RECONCILE: "hr-shift-eod-reconcile",
  HR_LEAVE_MONTHLY_ACCRUAL: "hr-leave-monthly-accrual",
  // Store-node -> cloud sync push.
  SYNC: "sync",
  // Store-node licensing daily re-validation.
  LICENSE: "license-validate",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Job Data Interfaces ───────────────────────────────────────────────────────

export interface InvoiceJobData {
  saleId: string;
  tenantId: string;
}

export interface ReportJobData {
  tenantId: string;
  storeId?: string;
  type: "sales" | "profit" | "stock" | "cashier";
  dateFrom: string; // ISO string
  dateTo: string; // ISO string
  requestedBy: string;
}

export interface LowStockJobData {
  tenantId: string;
  storeId: string;
  productId: string;
  productName: string;
  currentQuantity: number;
  reorderPoint: number;
}

export interface DailySnapshotJobData {
  tenantId: string;
  date: string; // ISO date string YYYY-MM-DD
}

export interface NotificationJobData {
  tenantId: string;
  recipientId: string;
  type: "sale_complete" | "low_stock" | "report_ready" | "shift_summary";
  payload: Record<string, unknown>;
}

export interface DemoStockRefillJobData {
  triggeredAt: string; // ISO string — informational only
}

export interface DemoResetJobData {
  triggeredAt: string; // ISO string — informational only
}

// Shift-swap-request expiry sweep. One job
// per tenant per day; touches all ShiftSwapRequest rows with
// `expiresAt < now` and PENDING_* status. Empty payload — the
// worker sweeps across every tenant.
export interface HrShiftSwapExpiryJobData {
  /** ISO string — informational only. */
  scheduledAt: string;
}

// End-of-day shift reconciliation. Walks the
// previous day's ScheduledShiftSchedule rows: PRESENT punches →
// COMPLETED, on-leave-confirmed → ON_LEAVE, no punch + no leave →
// ABSENT.
export interface HrShiftEodReconcileJobData {
  /** YYYY-MM-DD — the day to reconcile. */
  date: string;
}

// Monthly leave accrual. Runs on the first of
// every month: for every active LeavePolicy with
// accrualMethod=MONTHLY_ACCRUAL, increments LeaveBalance.entitledDays
// by entitledDaysPerYear/12 for the current cycle.
export interface HrLeaveMonthlyAccrualJobData {
  /** YYYY-MM — the month being accrued for. */
  month: string;
}

// Store-node -> cloud sync push trigger. The processor drains the
// local sync_outbox itself (see src/sync/sync-client.ts), so the job
// payload carries no data to act on — it's just a wakeup signal.
export interface SyncJobData {
  /** Optional — informational only (e.g. "scheduled" | "manual"). */
  reason?: string;
}

// Store-node licensing daily re-validation. No data to act on — the
// processor rebuilds the license client from config/db itself; the
// payload is informational only (mirrors SyncJobData).
export interface LicenseJobData {
  /** ISO string — informational only. */
  triggeredAt: string;
}

// ─── Queue Instances ───────────────────────────────────────────────────────────
// Each queue is a singleton — instantiated once and reused.
// Queues are cheap to create but we avoid unnecessary duplicates.

export const invoiceQueue = new Queue<InvoiceJobData>(QUEUE_NAMES.INVOICE, DEFAULT_QUEUE_OPTIONS);

export const reportQueue = new Queue<ReportJobData>(QUEUE_NAMES.REPORT, DEFAULT_QUEUE_OPTIONS);

export const lowStockQueue = new Queue<LowStockJobData>(QUEUE_NAMES.LOW_STOCK, {
  ...DEFAULT_QUEUE_OPTIONS,
  defaultJobOptions: {
    ...DEFAULT_QUEUE_OPTIONS.defaultJobOptions,
    // Deduplicate low-stock alerts — same product + store within 1 hour
    // prevents alert spam when stock bounces near the reorder point
    // debounce: {
    //     id: "", // set per job: `${storeId}:${productId}`
    //     ttl: 60 * 60 * 1000,
    // },
  },
});

export const dailySnapshotQueue = new Queue<DailySnapshotJobData>(
  QUEUE_NAMES.DAILY_SNAP,
  DEFAULT_QUEUE_OPTIONS,
);

export const notificationQueue = new Queue<NotificationJobData>(QUEUE_NAMES.NOTIFICATION, {
  ...DEFAULT_QUEUE_OPTIONS,
  defaultJobOptions: {
    ...DEFAULT_QUEUE_OPTIONS.defaultJobOptions,
    attempts: 5, // Notifications get more retries
  },
});

// Only registered/scheduled when DEMO_MODE=true, but the queue instance
// is always created here so imports resolve cleanly in all environments.
export const demoStockRefillQueue = new Queue<DemoStockRefillJobData>(QUEUE_NAMES.DEMO_REFILL, {
  ...DEFAULT_QUEUE_OPTIONS,
  defaultJobOptions: {
    ...DEFAULT_QUEUE_OPTIONS.defaultJobOptions,
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
  },
});

export const demoResetQueue = new Queue<DemoResetJobData>(QUEUE_NAMES.DEMO_RESET, {
  ...DEFAULT_QUEUE_OPTIONS,
  defaultJobOptions: {
    ...DEFAULT_QUEUE_OPTIONS.defaultJobOptions,
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
  },
});

// HR scheduled jobs.
export const hrShiftSwapExpiryQueue = new Queue<HrShiftSwapExpiryJobData>(
  QUEUE_NAMES.HR_SHIFT_SWAP_EXPIRY,
  DEFAULT_QUEUE_OPTIONS,
);

export const hrShiftEodReconcileQueue = new Queue<HrShiftEodReconcileJobData>(
  QUEUE_NAMES.HR_SHIFT_EOD_RECONCILE,
  DEFAULT_QUEUE_OPTIONS,
);

export const hrLeaveMonthlyAccrualQueue = new Queue<HrLeaveMonthlyAccrualJobData>(
  QUEUE_NAMES.HR_LEAVE_MONTHLY_ACCRUAL,
  DEFAULT_QUEUE_OPTIONS,
);

export const syncQueue = new Queue<SyncJobData>(QUEUE_NAMES.SYNC, DEFAULT_QUEUE_OPTIONS);

export const licenseQueue = new Queue<LicenseJobData>(QUEUE_NAMES.LICENSE, DEFAULT_QUEUE_OPTIONS);

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Close all queue connections gracefully.
 * Call this alongside disconnectRedis() on SIGTERM.
 */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    invoiceQueue.close(),
    reportQueue.close(),
    lowStockQueue.close(),
    dailySnapshotQueue.close(),
    notificationQueue.close(),
    demoStockRefillQueue.close(),
    demoResetQueue.close(),
    hrShiftSwapExpiryQueue.close(),
    hrShiftEodReconcileQueue.close(),
    hrLeaveMonthlyAccrualQueue.close(),
    syncQueue.close(),
    licenseQueue.close(),
  ]);
}
