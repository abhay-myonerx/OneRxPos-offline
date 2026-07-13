import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../ar-report.service", () => ({
  getArAgingReport: vi.fn(async () => ({
    asOf: "2026-07-09T00:00:00.000Z",
    rows: [
      { customerId: "c1", customerName: "Acme", current: 100, d31_60: 0, d61_90: 150, d90plus: 0, total: 250, currentBalance: 250 },
    ],
    summary: { current: 100, d31_60: 0, d61_90: 150, d90plus: 0, total: 250 },
  })),
}));

import { arAgingReport, exportArAgingCSV } from "../report.controller";
import { getArAgingReport } from "../ar-report.service";

function res() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  r.send = vi.fn(() => r);
  r.setHeader = vi.fn(() => r);
  return r;
}
beforeEach(() => vi.clearAllMocks());

describe("GET /reports/ar-aging", () => {
  it("returns the aging report", async () => {
    const req: any = { db: {}, query: {} };
    const r = res();
    await arAgingReport(req, r, vi.fn());
    expect(getArAgingReport).toHaveBeenCalled();
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe("GET /reports/export/ar-aging", () => {
  it("streams a CSV with the aging columns + totals", async () => {
    const req: any = { db: {}, query: {} };
    const r = res();
    await exportArAgingCSV(req, r, vi.fn());
    expect(r.setHeader).toHaveBeenCalledWith("Content-Type", "text/csv; charset=utf-8");
    const body = (r.send.mock.calls[0][0] as string);
    expect(body).toContain("Acme");
    expect(body).toContain("Current");
    expect(body).toContain("TOTAL");
  });
});
