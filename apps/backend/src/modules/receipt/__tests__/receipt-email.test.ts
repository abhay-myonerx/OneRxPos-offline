import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../receipt.service", () => ({
  generateReceipt: vi.fn(async () => "<html>receipt</html>"),
}));
vi.mock("../../messaging/messaging.service", () => ({
  enqueue: vi.fn(async () => ({ id: "r1", status: "QUEUED" })),
  loadTenantContext: vi.fn(async () => ({ id: "t1", encryptionKeyVersion: 1, settings: {} })),
}));

import { emailReceipt } from "../receipt.controller";
import { enqueue } from "../../messaging/messaging.service";

function makeRes() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
}

beforeEach(() => vi.clearAllMocks());

describe("POST receipts/sale/:saleId/email", () => {
  it("400 when the sale has no customer email and no override", async () => {
    const req: any = {
      db: { sale: { findUnique: vi.fn(async () => ({ id: "s1", storeId: "st1", customer: { email: null } })) } },
      tenantId: "t1",
      user: { id: "u1" },
      params: { saleId: "s1" },
      body: {},
    };
    const next = vi.fn();
    await emailReceipt(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("enqueues a RECEIPT message to the customer", async () => {
    const req: any = {
      db: { sale: { findUnique: vi.fn(async () => ({ id: "s1", storeId: "st1", customer: { email: "c@x.co", name: "C" } })) } },
      tenantId: "t1",
      user: { id: "u1" },
      params: { saleId: "s1" },
      body: {},
    };
    const res = makeRes();
    await emailReceipt(req, res, vi.fn());
    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        kind: "RECEIPT",
        to: { email: "c@x.co", name: "C" },
        related: { type: "Sale", id: "s1" },
      }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("honors a body.to override", async () => {
    const req: any = {
      db: { sale: { findUnique: vi.fn(async () => ({ id: "s1", storeId: "st1", customer: { email: "c@x.co", name: "C" } })) } },
      tenantId: "t1",
      user: { id: "u1" },
      params: { saleId: "s1" },
      body: { to: "override@x.co" },
    };
    await emailReceipt(req, makeRes(), vi.fn());
    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ to: { email: "override@x.co", name: "C" } }),
    );
  });
});
