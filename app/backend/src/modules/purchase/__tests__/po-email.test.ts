import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderPurchaseOrderHtml } from "../purchase-order.render";

describe("renderPurchaseOrderHtml", () => {
  it("lists line items and the PO number", () => {
    const html = renderPurchaseOrderHtml({
      purchaseNo: "PO-001",
      grandTotal: "12.00",
      supplier: { name: "Acme" },
      items: [{ product: { name: "Aspirin" }, orderedQty: 10, unitCost: "1.20" }],
    });
    expect(html).toContain("PO-001");
    expect(html).toContain("Aspirin");
    expect(html).toContain("Acme");
  });
});

vi.mock("../purchase.service", () => ({
  getPurchaseById: vi.fn(async () => ({
    id: "po1",
    storeId: "st1",
    purchaseNo: "PO-001",
    grandTotal: "12.00",
    supplier: { name: "Acme", email: "acme@x.co" },
    items: [{ product: { name: "Aspirin" }, orderedQty: 10, unitCost: "1.20" }],
  })),
}));
vi.mock("../../messaging/messaging.service", () => ({
  enqueue: vi.fn(async () => ({ id: "r1", status: "QUEUED" })),
  loadTenantContext: vi.fn(async () => ({ id: "t1", encryptionKeyVersion: 1, settings: {} })),
}));

import { emailPurchaseOrder } from "../purchase.controller";
import { enqueue } from "../../messaging/messaging.service";
import * as purchaseService from "../purchase.service";

function makeRes() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
}

beforeEach(() => vi.clearAllMocks());

describe("POST purchases/:id/email", () => {
  it("enqueues a PURCHASE_ORDER to the supplier", async () => {
    const req: any = { db: {}, tenantId: "t1", user: { id: "u1" }, params: { id: "po1" }, body: {} };
    const res = makeRes();
    await emailPurchaseOrder(req, res, vi.fn());
    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        kind: "PURCHASE_ORDER",
        to: { email: "acme@x.co", name: "Acme" },
        related: { type: "PurchaseOrder", id: "po1" },
      }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("400 when the supplier has no email", async () => {
    (purchaseService.getPurchaseById as any).mockResolvedValueOnce({
      id: "po1",
      storeId: "st1",
      purchaseNo: "PO-001",
      grandTotal: "12.00",
      supplier: { name: "Acme", email: null },
      items: [],
    });
    const req: any = { db: {}, tenantId: "t1", user: { id: "u1" }, params: { id: "po1" }, body: {} };
    const next = vi.fn();
    await emailPurchaseOrder(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(enqueue).not.toHaveBeenCalled();
  });
});
