import { describe, it, expect, vi, beforeEach } from "vitest";

const statement = {
  customer: { id: "c1", name: "Acme", email: "a@c.co" },
  asOf: "2026-07-09T00:00:00.000Z",
  openInvoices: [],
  recentPayments: [],
  aging: { current: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 },
  currentBalance: 0,
  reconciled: true,
};

vi.mock("../../report/ar-report.service", () => ({
  getCustomerStatement: vi.fn(async () => statement),
}));
vi.mock("../customer.service", () => ({}));
vi.mock("../loyalty.service", () => ({}));
vi.mock("../../messaging/messaging.service", () => ({ enqueue: vi.fn(), loadTenantContext: vi.fn() }));
vi.mock("../customer-statement.render", () => ({ renderStatementHtml: () => "<html>statement</html>" }));

import { statement as statementHandler, statementPrint } from "../customer.controller";
import { getCustomerStatement } from "../../report/ar-report.service";

function makeRes() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  r.send = vi.fn(() => r);
  r.setHeader = vi.fn(() => r);
  return r;
}
beforeEach(() => vi.clearAllMocks());

describe("GET /customers/:id/statement", () => {
  it("returns the statement JSON", async () => {
    const req: any = { db: {}, params: { id: "c1" }, query: {} };
    const r = makeRes();
    await statementHandler(req, r, vi.fn());
    expect(getCustomerStatement).toHaveBeenCalledWith({}, "c1", { asOf: undefined });
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("passes asOf when provided", async () => {
    const req: any = { db: {}, params: { id: "c1" }, query: { asOf: "2026-06-01" } };
    await statementHandler(req, makeRes(), vi.fn());
    const arg = (getCustomerStatement as any).mock.calls[0][2];
    expect(arg.asOf).toBeInstanceOf(Date);
  });
});

describe("GET /customers/:id/statement/print", () => {
  it("returns printable HTML", async () => {
    const req: any = { db: {}, params: { id: "c1" }, query: {} };
    const r = makeRes();
    await statementPrint(req, r, vi.fn());
    expect(r.setHeader).toHaveBeenCalledWith("Content-Type", "text/html; charset=utf-8");
    expect(r.send).toHaveBeenCalledWith("<html>statement</html>");
  });
});
