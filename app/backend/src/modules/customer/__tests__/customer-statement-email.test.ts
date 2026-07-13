import { describe, it, expect, vi, beforeEach } from "vitest";

const statement = {
  customer: { id: "c1", name: "Acme", email: "a@c.co" },
  asOf: "2026-07-09T00:00:00.000Z",
  openInvoices: [
    { saleId: "s1", invoiceNo: "INV-1", date: "2026-05-01T00:00:00.000Z", ageDays: 69, bucket: "d61_90", grandTotal: 200, dueAmount: 150 },
  ],
  recentPayments: [],
  aging: { current: 0, d31_60: 0, d61_90: 150, d90plus: 0, total: 150 },
  currentBalance: 150,
  reconciled: true,
};

vi.mock("../../report/ar-report.service", () => ({
  getCustomerStatement: vi.fn(async () => statement),
}));
vi.mock("../customer.service", () => ({}));
vi.mock("../loyalty.service", () => ({}));
vi.mock("../../messaging/messaging.service", () => ({
  enqueue: vi.fn(async () => ({ id: "r1", status: "QUEUED" })),
  loadTenantContext: vi.fn(async () => ({ id: "t1", encryptionKeyVersion: 1, settings: {} })),
}));

import { emailStatement } from "../customer.controller";
import { enqueue } from "../../messaging/messaging.service";
import { getCustomerStatement } from "../../report/ar-report.service";

function makeRes() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
}

beforeEach(() => vi.clearAllMocks());

describe("POST customers/:id/statement/email (3H.6 aging statement)", () => {
  it("400 when the customer has no email and no override", async () => {
    (getCustomerStatement as any).mockResolvedValueOnce({ ...statement, customer: { ...statement.customer, email: null } });
    const req: any = { db: {}, tenantId: "t1", user: { id: "u1" }, params: { id: "c1" }, body: {} };
    const next = vi.fn();
    await emailStatement(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("enqueues an AR_STATEMENT whose HTML carries the aging buckets", async () => {
    const req: any = { db: {}, tenantId: "t1", user: { id: "u1" }, params: { id: "c1" }, body: {} };
    const res = makeRes();
    await emailStatement(req, res, vi.fn());
    const call = (enqueue as any).mock.calls[0][2];
    expect(call).toMatchObject({
      kind: "AR_STATEMENT",
      to: { email: "a@c.co", name: "Acme" },
      related: { type: "Customer", id: "c1" },
    });
    expect(call.html).toContain("Aging summary");
    expect(call.html).toContain("INV-1");
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
