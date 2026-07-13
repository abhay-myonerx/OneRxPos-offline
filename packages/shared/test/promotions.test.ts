import { describe, it, expect } from "vitest";
import { resolvePromotions, type PromoLine, type PromoRule, type PromoContext } from "../src/pricing/promotions";

const NOW = new Date("2026-07-09T00:00:00Z");
const ctx = (over: Partial<PromoContext> = {}): PromoContext => ({ now: NOW, ...over });

function line(over: Partial<PromoLine> & { id: string }): PromoLine {
  return { productId: over.id, categoryId: null, unitPrice: "10", qty: "1", existingLineDiscount: "0", ...over };
}
function rule(over: Partial<PromoRule> & { id: string; type: PromoRule["type"]; config: unknown }): PromoRule {
  return {
    name: over.id, priority: 0, stackable: false, startsAt: null, endsAt: null, couponCode: null,
    customerGroupId: null, minSubtotal: null, usageLimit: null, timesUsed: 0, ...over,
  };
}

describe("PERCENT_OFF", () => {
  it("scoped → per-line discount", () => {
    const r = resolvePromotions(
      [line({ id: "p1", unitPrice: "100", qty: "1" })],
      [rule({ id: "x", type: "PERCENT_OFF", config: { percent: 10, scope: { productIds: ["p1"] } } })],
      ctx(),
    );
    expect(r.lineDiscounts["p1"]).toBe("10");
    expect(r.applied[0].amount).toBe("10");
  });
  it("cart-wide → cart discount", () => {
    const r = resolvePromotions(
      [line({ id: "p1", unitPrice: "100" }), line({ id: "p2", unitPrice: "100" })],
      [rule({ id: "x", type: "PERCENT_OFF", config: { percent: 10 } })],
      ctx(),
    );
    expect(r.cartDiscount).toBe("20");
  });
});

describe("FIXED_OFF + COUPON + GROUP", () => {
  it("FIXED_OFF cart-wide", () => {
    const r = resolvePromotions([line({ id: "p1", unitPrice: "50" })], [rule({ id: "x", type: "FIXED_OFF", config: { amount: 5 } })], ctx());
    expect(r.cartDiscount).toBe("5");
  });
  it("COUPON only applies when the code matches", () => {
    const rules = [rule({ id: "c", type: "COUPON", couponCode: "SAVE10", config: { mode: "percent", value: 10 } })];
    expect(resolvePromotions([line({ id: "p1", unitPrice: "100" })], rules, ctx()).cartDiscount).toBe("0");
    expect(resolvePromotions([line({ id: "p1", unitPrice: "100" })], rules, ctx({ couponCode: "SAVE10" })).cartDiscount).toBe("10");
  });
  it("GROUP discount from ctx activates the dead field", () => {
    const r = resolvePromotions([line({ id: "p1", unitPrice: "100" })], [], ctx({ groupDiscountPercent: "5" }));
    expect(r.cartDiscount).toBe("5");
  });
});

describe("BOGO", () => {
  it("buy 2 get 1 free (same product, qty 3 → 1 free)", () => {
    const r = resolvePromotions(
      [line({ id: "p1", unitPrice: "10", qty: "3" })],
      [rule({ id: "b", type: "BOGO", config: { buyProductId: "p1", buyQty: 2, getQty: 1, getPercent: 100 } })],
      ctx(),
    );
    expect(r.lineDiscounts["p1"]).toBe("10");
  });
  it("buy X get a different Y at 50%", () => {
    const r = resolvePromotions(
      [line({ id: "p1", unitPrice: "20", qty: "1" }), line({ id: "p2", unitPrice: "8", qty: "1" })],
      [rule({ id: "b", type: "BOGO", config: { buyProductId: "p1", buyQty: 1, getProductId: "p2", getQty: 1, getPercent: 50 } })],
      ctx(),
    );
    expect(r.lineDiscounts["p2"]).toBe("4");
  });
});

describe("VOLUME_TIER + BUNDLE", () => {
  it("VOLUME_TIER picks the best tier ≤ qty", () => {
    const r = resolvePromotions(
      [line({ id: "p1", unitPrice: "10", qty: "12" })],
      [rule({ id: "v", type: "VOLUME_TIER", config: { tiers: [{ minQty: 5, percent: 5 }, { minQty: 10, percent: 10 }] } })],
      ctx(),
    );
    expect(r.lineDiscounts["p1"]).toBe("12"); // 120 net * 10%
  });
  it("VOLUME_TIER below smallest tier → nothing", () => {
    const r = resolvePromotions(
      [line({ id: "p1", unitPrice: "10", qty: "2" })],
      [rule({ id: "v", type: "VOLUME_TIER", config: { tiers: [{ minQty: 5, percent: 5 }] } })],
      ctx(),
    );
    expect(r.lineDiscounts["p1"]).toBeUndefined();
  });
  it("BUNDLE: all present → discount to bundle price", () => {
    const r = resolvePromotions(
      [line({ id: "a", unitPrice: "30", qty: "1" }), line({ id: "b", unitPrice: "20", qty: "1" })],
      [rule({ id: "bn", type: "BUNDLE", config: { productIds: ["a", "b"], bundlePrice: 40 } })],
      ctx(),
    );
    // base 50 → target 40 → 10 discount distributed 6/4
    expect(r.lineDiscounts["a"]).toBe("6");
    expect(r.lineDiscounts["b"]).toBe("4");
  });
  it("BUNDLE: a member missing → nothing", () => {
    const r = resolvePromotions(
      [line({ id: "a", unitPrice: "30", qty: "1" })],
      [rule({ id: "bn", type: "BUNDLE", config: { productIds: ["a", "b"], bundlePrice: 40 } })],
      ctx(),
    );
    expect(r.applied).toHaveLength(0);
  });
});

describe("stacking + floor + eligibility", () => {
  it("only the best non-stackable applies", () => {
    const r = resolvePromotions(
      [line({ id: "p1", unitPrice: "100" })],
      [
        rule({ id: "small", type: "PERCENT_OFF", stackable: false, config: { percent: 10 } }),
        rule({ id: "big", type: "PERCENT_OFF", stackable: false, config: { percent: 20 } }),
      ],
      ctx(),
    );
    expect(r.cartDiscount).toBe("20"); // best of the two, not 30
    expect(r.applied).toHaveLength(1);
  });
  it("stackable promos combine", () => {
    const r = resolvePromotions(
      [line({ id: "p1", unitPrice: "100" })],
      [
        rule({ id: "a", type: "PERCENT_OFF", stackable: true, priority: 1, config: { percent: 10 } }),
        rule({ id: "b", type: "FIXED_OFF", stackable: true, priority: 2, config: { amount: 5 } }),
      ],
      ctx(),
    );
    expect(r.cartDiscount).toBe("15"); // 10 + 5
  });
  it("floor: cart discount can't exceed the cart net", () => {
    const r = resolvePromotions(
      [line({ id: "p1", unitPrice: "10" })],
      [rule({ id: "x", type: "FIXED_OFF", stackable: true, config: { amount: 999 } })],
      ctx(),
    );
    expect(r.cartDiscount).toBe("10");
  });
  it("expired promo is ignored", () => {
    const r = resolvePromotions(
      [line({ id: "p1", unitPrice: "100" })],
      [rule({ id: "x", type: "PERCENT_OFF", endsAt: new Date("2026-01-01T00:00:00Z"), config: { percent: 10 } })],
      ctx(),
    );
    expect(r.applied).toHaveLength(0);
  });
  it("minSubtotal gate", () => {
    const rules = [rule({ id: "x", type: "PERCENT_OFF", minSubtotal: "200", config: { percent: 10 } })];
    expect(resolvePromotions([line({ id: "p1", unitPrice: "100" })], rules, ctx()).applied).toHaveLength(0);
    expect(resolvePromotions([line({ id: "p1", unitPrice: "300" })], rules, ctx()).cartDiscount).toBe("30");
  });
  it("usageLimit exhausted → ignored", () => {
    const r = resolvePromotions(
      [line({ id: "p1", unitPrice: "100" })],
      [rule({ id: "x", type: "PERCENT_OFF", usageLimit: 1, timesUsed: 1, config: { percent: 10 } })],
      ctx(),
    );
    expect(r.applied).toHaveLength(0);
  });
});
