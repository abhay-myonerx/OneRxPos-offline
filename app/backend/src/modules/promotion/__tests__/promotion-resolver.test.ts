import { describe, it, expect, vi } from "vitest";
import { resolveForCart } from "../promotion-resolver";

const NOW = new Date("2026-07-09T00:00:00Z");
const line = { id: "p1", productId: "p1", categoryId: null, unitPrice: "100", qty: "1", existingLineDiscount: "0" };

describe("resolveForCart", () => {
  it("loads active promos + group discount and runs the engine", async () => {
    const db: any = {
      promotion: {
        findMany: vi.fn(async () => [
          { id: "x", name: "10%", type: "PERCENT_OFF", priority: 0, stackable: true, startsAt: null, endsAt: null, couponCode: null, customerGroupId: null, minSubtotal: null, usageLimit: null, timesUsed: 0, config: { percent: 10 } },
        ]),
      },
      customer: { findUnique: vi.fn(async () => ({ groupId: "g1", group: { discountPercent: 5 } })) },
    };
    const r = await resolveForCart(db, { lines: [line], customerId: "c1", now: NOW });
    // 10% promo + 5% group both cart-wide stackable → 15
    expect(r.cartDiscount).toBe("15");
  });

  it("returns an empty result (never throws) when the load fails", async () => {
    const db: any = { promotion: { findMany: vi.fn(async () => { throw new Error("db down"); }) } };
    const r = await resolveForCart(db, { lines: [line], now: NOW });
    expect(r).toEqual({ lineDiscounts: {}, cartDiscount: "0", applied: [] });
  });

  it("passes the coupon code through", async () => {
    const db: any = {
      promotion: {
        findMany: vi.fn(async () => [
          { id: "c", name: "SAVE", type: "COUPON", priority: 0, stackable: false, startsAt: null, endsAt: null, couponCode: "SAVE", customerGroupId: null, minSubtotal: null, usageLimit: null, timesUsed: 0, config: { mode: "percent", value: 10 } },
        ]),
      },
      customer: { findUnique: vi.fn() },
    };
    expect((await resolveForCart(db, { lines: [line], now: NOW })).cartDiscount).toBe("0");
    expect((await resolveForCart(db, { lines: [line], couponCode: "SAVE", now: NOW })).cartDiscount).toBe("10");
  });
});
