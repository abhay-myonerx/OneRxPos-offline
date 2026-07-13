import { describe, it, expect } from "vitest";
import { renderStatementHtml } from "../customer-statement.render";
import type { CustomerStatement } from "../../report/ar-report.service";

const base: CustomerStatement = {
  customer: { id: "c1", name: "<b>A&B</b>", email: "a@x.co" },
  asOf: "2026-07-09T00:00:00.000Z",
  openInvoices: [
    { saleId: "s1", invoiceNo: "INV-1", date: "2026-05-01T00:00:00.000Z", ageDays: 69, bucket: "d61_90", grandTotal: 200, dueAmount: 150 },
  ],
  recentPayments: [{ date: "2026-07-05T00:00:00.000Z", method: "CASH", amount: 50 }],
  aging: { current: 0, d31_60: 0, d61_90: 150, d90plus: 0, total: 150 },
  currentBalance: 150,
  reconciled: true,
};

describe("renderStatementHtml", () => {
  it("includes the aging buckets, open invoices, payments, and escapes the name", () => {
    const html = renderStatementHtml(base);
    expect(html).toContain("Aging summary");
    expect(html).toContain("INV-1");
    expect(html).toContain("150.00");
    expect(html).toContain("69"); // age
    expect(html).toContain("CASH");
    expect(html).toContain("&lt;b&gt;A&amp;B");
    expect(html).not.toContain("<b>A&B</b>");
  });

  it("shows a reconciliation note when aging total != balance", () => {
    const html = renderStatementHtml({ ...base, reconciled: false, currentBalance: 200 });
    expect(html).toContain("differs from the account balance");
  });

  it("handles a customer with no open invoices", () => {
    const html = renderStatementHtml({
      ...base,
      openInvoices: [],
      aging: { current: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 },
      currentBalance: 0,
    });
    expect(html).toContain("No open invoices.");
  });
});
