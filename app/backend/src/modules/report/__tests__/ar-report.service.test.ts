import { describe, it, expect, vi } from "vitest";
import { bucketFor, ageDays, getArAgingReport, getCustomerStatement } from "../ar-report.service";

describe("bucketFor", () => {
  it("maps boundary ages", () => {
    expect(bucketFor(0)).toBe("current");
    expect(bucketFor(30)).toBe("current");
    expect(bucketFor(31)).toBe("d31_60");
    expect(bucketFor(60)).toBe("d31_60");
    expect(bucketFor(61)).toBe("d61_90");
    expect(bucketFor(90)).toBe("d61_90");
    expect(bucketFor(91)).toBe("d90plus");
  });
});

describe("ageDays", () => {
  it("floors the day difference, never negative", () => {
    const asOf = new Date("2026-07-09T00:00:00Z");
    expect(ageDays(new Date("2026-07-09T00:00:00Z"), asOf)).toBe(0);
    expect(ageDays(new Date("2026-06-09T00:00:00Z"), asOf)).toBe(30);
    expect(ageDays(new Date("2026-08-09T00:00:00Z"), asOf)).toBe(0); // future → 0
  });
});

const asOf = new Date("2026-07-09T00:00:00Z");

describe("getArAgingReport", () => {
  function db(sales: any[]) {
    return { sale: { findMany: vi.fn(async () => sales) } } as any;
  }
  it("buckets each open invoice per customer + totals, sorted by total desc", async () => {
    const sales = [
      { id: "s1", customerId: "c1", dueAmount: 100, createdAt: new Date("2026-07-01T00:00:00Z"), customer: { id: "c1", name: "A", currentBalance: 250 } },
      { id: "s2", customerId: "c1", dueAmount: 150, createdAt: new Date("2026-05-01T00:00:00Z"), customer: { id: "c1", name: "A", currentBalance: 250 } },
      { id: "s3", customerId: "c2", dueAmount: 40, createdAt: new Date("2026-03-01T00:00:00Z"), customer: { id: "c2", name: "B", currentBalance: 40 } },
    ];
    const report = await getArAgingReport(db(sales), { asOf });
    const a = report.rows.find((r) => r.customerId === "c1")!;
    expect(a.current).toBe(100); // 8 days
    expect(a.d61_90).toBe(150); // 69 days
    expect(a.total).toBe(250);
    expect(a.currentBalance).toBe(250);
    expect(report.summary.d90plus).toBe(40); // 130 days
    expect(report.summary.total).toBe(290);
    expect(report.rows[0].customerId).toBe("c1"); // 250 > 40
  });
  it("returns an empty report when there are no receivables", async () => {
    const report = await getArAgingReport(db([]), {});
    expect(report.rows).toHaveLength(0);
    expect(report.summary.total).toBe(0);
  });
});

describe("getCustomerStatement", () => {
  it("returns open invoices (oldest first) + aging + reconciled flag", async () => {
    const db: any = {
      customer: { findUnique: vi.fn(async () => ({ id: "c1", name: "A", email: "a@x.co", currentBalance: 250 })) },
      sale: {
        findMany: vi.fn(async () => [
          { id: "s2", invoiceNo: "INV-2", dueAmount: 150, grandTotal: 200, createdAt: new Date("2026-05-01T00:00:00Z") },
          { id: "s1", invoiceNo: "INV-1", dueAmount: 100, grandTotal: 100, createdAt: new Date("2026-07-01T00:00:00Z") },
        ]),
      },
      payment: { findMany: vi.fn(async () => [{ createdAt: new Date("2026-07-05"), method: "CASH", amount: 50 }]) },
    };
    const st = await getCustomerStatement(db, "c1", { asOf });
    expect(st.openInvoices).toHaveLength(2);
    expect(st.aging.total).toBe(250);
    expect(st.aging.current).toBe(100);
    expect(st.aging.d61_90).toBe(150);
    expect(st.reconciled).toBe(true);
    expect(st.recentPayments[0].amount).toBe(50);
  });
  it("flags not-reconciled when sum(due) !== currentBalance", async () => {
    const db: any = {
      customer: { findUnique: vi.fn(async () => ({ id: "c1", name: "A", email: null, currentBalance: 999 })) },
      sale: { findMany: vi.fn(async () => [{ id: "s1", invoiceNo: "INV-1", dueAmount: 100, grandTotal: 100, createdAt: new Date("2026-07-01T00:00:00Z") }]) },
      payment: { findMany: vi.fn(async () => []) },
    };
    const st = await getCustomerStatement(db, "c1", { asOf });
    expect(st.reconciled).toBe(false);
  });
  it("404s an unknown customer", async () => {
    const db: any = { customer: { findUnique: vi.fn(async () => null) } };
    await expect(getCustomerStatement(db, "nope", {})).rejects.toMatchObject({ statusCode: 404 });
  });
});
