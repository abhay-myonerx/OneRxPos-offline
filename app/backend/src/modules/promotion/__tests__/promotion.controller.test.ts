import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../promotion.service", () => ({
  listPromotions: vi.fn(async () => [{ id: "p1", type: "PERCENT_OFF" }]),
  createPromotion: vi.fn(async () => ({ id: "p1", type: "PERCENT_OFF" })),
  updatePromotion: vi.fn(async () => ({ id: "p1" })),
  setActive: vi.fn(async () => ({ id: "p1", isActive: false })),
  removePromotion: vi.fn(async () => {}),
}));
vi.mock("../promotion-resolver", () => ({
  resolveForCart: vi.fn(async () => ({ lineDiscounts: { "prod-1": "10" }, cartDiscount: "0", applied: [{ promotionId: "c1", name: "SAVE", amount: "10" }] })),
}));

import * as controller from "../promotion.controller";
import * as svc from "../promotion.service";

const uuid = "11111111-1111-4111-8111-111111111111";
function res() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
}
function db() {
  return {
    product: { findMany: vi.fn(async () => [{ id: uuid, categoryId: null }]) },
    promotion: { findFirst: vi.fn(async () => ({ id: "c1", name: "SAVE" })) },
  };
}
beforeEach(() => vi.clearAllMocks());

describe("promotion CRUD", () => {
  it("lists", async () => {
    const r = res();
    await controller.list({ db: db() } as any, r, vi.fn());
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("creates (201) with a valid PERCENT_OFF body", async () => {
    const req: any = { db: db(), body: { name: "10%", type: "PERCENT_OFF", config: { percent: 10 } } };
    const r = res();
    await controller.create(req, r, vi.fn());
    expect(svc.createPromotion).toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(201);
  });
  it("rejects an invalid body via next", async () => {
    const req: any = { db: db(), body: { name: "", type: "NOPE", config: {} } };
    const next = vi.fn();
    await controller.create(req, res(), next);
    expect(next).toHaveBeenCalled();
    expect(svc.createPromotion).not.toHaveBeenCalled();
  });
});

describe("preview + validate-coupon", () => {
  it("preview returns discounts + a discountTotal", async () => {
    const req: any = { db: db(), body: { items: [{ productId: uuid, quantity: 1, unitPrice: 100 }] } };
    const r = res();
    await controller.preview(req, r, vi.fn());
    const payload = r.json.mock.calls[0][0].data;
    expect(payload.discountTotal).toBe("10");
    expect(payload.applied).toHaveLength(1);
  });
  it("validate-coupon reports valid when the code applies", async () => {
    const req: any = { db: db(), body: { code: "SAVE", items: [{ productId: uuid, quantity: 1, unitPrice: 100 }] } };
    const r = res();
    await controller.validateCoupon(req, r, vi.fn());
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ valid: true, discount: "10" }) }));
  });
  it("validate-coupon reports invalid for an unknown code", async () => {
    const d: any = db();
    d.promotion.findFirst = vi.fn(async () => null);
    const req: any = { db: d, body: { code: "NOPE" } };
    const r = res();
    await controller.validateCoupon(req, r, vi.fn());
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ valid: false }) }));
  });
});
