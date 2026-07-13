// 3H.6 accounts-receivable aging + customer statements.
//
// Aging is invoice-date based: an open receivable is a `Sale` with status PARTIAL
// and dueAmount > 0; its age = whole days from `createdAt` to the report `asOf`
// (default now). Buckets: Current 0–30, 31–60, 61–90, 90+.
//
// Source of truth is the per-invoice open dueAmount. Each customer's headline
// `currentBalance` is surfaced alongside so any drift (a collect-due posted
// without a saleId lowers currentBalance but no specific invoice) is VISIBLE via
// the `reconciled` flag rather than silently masked.

import { NotFoundError } from "../../shared/errors";

export type BucketKey = "current" | "d31_60" | "d61_90" | "d90plus";
export interface AgingBuckets {
  current: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
}

const DAY_MS = 86_400_000;

/** Whole days from an invoice's createdAt to the as-of date; never negative. */
export function ageDays(createdAt: Date, asOf: Date): number {
  return Math.max(0, Math.floor((asOf.getTime() - new Date(createdAt).getTime()) / DAY_MS));
}

export function bucketFor(days: number): BucketKey {
  if (days <= 30) return "current";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90plus";
}

function emptyBuckets(): AgingBuckets {
  return { current: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ArAgingRow extends AgingBuckets {
  customerId: string;
  customerName: string;
  currentBalance: number;
}
export interface ArAgingReport {
  asOf: string;
  rows: ArAgingRow[];
  summary: AgingBuckets;
}

export async function getArAgingReport(
  db: any,
  opts: { asOf?: Date; storeId?: string },
): Promise<ArAgingReport> {
  const asOf = opts.asOf ?? new Date();
  const where: Record<string, unknown> = { status: "PARTIAL", dueAmount: { gt: 0 } };
  if (opts.storeId) where.storeId = opts.storeId;

  const sales = await db.sale.findMany({
    where,
    select: {
      id: true,
      customerId: true,
      dueAmount: true,
      createdAt: true,
      customer: { select: { id: true, name: true, currentBalance: true } },
    },
  });

  const byCustomer = new Map<string, ArAgingRow>();
  for (const s of sales) {
    if (!s.customerId || !s.customer) continue;
    let row = byCustomer.get(s.customerId);
    if (!row) {
      row = {
        customerId: s.customerId,
        customerName: s.customer.name,
        currentBalance: round2(Number(s.customer.currentBalance)),
        ...emptyBuckets(),
      };
      byCustomer.set(s.customerId, row);
    }
    const b = bucketFor(ageDays(s.createdAt, asOf));
    const due = Number(s.dueAmount);
    row[b] = round2(row[b] + due);
    row.total = round2(row.total + due);
  }

  const rows = [...byCustomer.values()].sort((a, b) => b.total - a.total);
  const summary = emptyBuckets();
  for (const r of rows) {
    summary.current = round2(summary.current + r.current);
    summary.d31_60 = round2(summary.d31_60 + r.d31_60);
    summary.d61_90 = round2(summary.d61_90 + r.d61_90);
    summary.d90plus = round2(summary.d90plus + r.d90plus);
    summary.total = round2(summary.total + r.total);
  }
  return { asOf: asOf.toISOString(), rows, summary };
}

// ── Per-customer statement ──────────────────────────────────────────────────

export interface OpenInvoice {
  saleId: string;
  invoiceNo: string;
  date: string;
  ageDays: number;
  bucket: BucketKey;
  grandTotal: number;
  dueAmount: number;
}
export interface CustomerStatement {
  customer: { id: string; name: string; email: string | null };
  asOf: string;
  openInvoices: OpenInvoice[];
  recentPayments: Array<{ date: string; method: string; amount: number }>;
  aging: AgingBuckets;
  currentBalance: number;
  reconciled: boolean;
}

export async function getCustomerStatement(
  db: any,
  customerId: string,
  opts: { asOf?: Date },
): Promise<CustomerStatement> {
  const asOf = opts.asOf ?? new Date();
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, email: true, currentBalance: true },
  });
  if (!customer) throw new NotFoundError("Customer", customerId);

  const sales = await db.sale.findMany({
    where: { customerId, status: "PARTIAL", dueAmount: { gt: 0 } },
    select: { id: true, invoiceNo: true, grandTotal: true, dueAmount: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const aging = emptyBuckets();
  const openInvoices: OpenInvoice[] = sales.map((s: any) => {
    const days = ageDays(s.createdAt, asOf);
    const bucket = bucketFor(days);
    const due = Number(s.dueAmount);
    aging[bucket] = round2(aging[bucket] + due);
    aging.total = round2(aging.total + due);
    return {
      saleId: s.id,
      invoiceNo: s.invoiceNo,
      date: new Date(s.createdAt).toISOString(),
      ageDays: days,
      bucket,
      grandTotal: round2(Number(s.grandTotal)),
      dueAmount: round2(due),
    };
  });

  const payments = await db.payment.findMany({
    where: { customerId },
    select: { createdAt: true, method: true, amount: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const recentPayments = payments.map((p: any) => ({
    date: new Date(p.createdAt).toISOString(),
    method: p.method,
    amount: round2(Number(p.amount)),
  }));

  const currentBalance = round2(Number(customer.currentBalance));
  return {
    customer: { id: customer.id, name: customer.name, email: customer.email ?? null },
    asOf: asOf.toISOString(),
    openInvoices,
    recentPayments,
    aging,
    currentBalance,
    reconciled: aging.total === currentBalance,
  };
}
