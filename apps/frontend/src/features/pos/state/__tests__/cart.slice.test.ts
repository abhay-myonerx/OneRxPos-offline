import { describe, it, expect } from "vitest";
import reducer, {
  addToCart,
  overrideLinePrice,
  voidLine,
  setDiscountOverride,
  replaceCart,
  resolveLineReauth,
  setDiscountReauth,
  linkRx,
  unlinkRx,
  setConsult,
  setLineSchedule,
} from "../cart.slice";
import type { CartItem, CartState } from "../../types/cart.types";

const item = (over: Partial<CartItem> = {}): CartItem => ({
  id: "L1", productId: "p1", name: "Widget", sku: "W1", unitPrice: 100, costPrice: 50,
  quantity: 1, discount: 0, taxCategory: "STANDARD", taxInclusive: false, levies: [], maxStock: 10, ...over,
});

describe("cart slice line-ops", () => {
  const seeded = reducer(undefined, addToCart(item()));
  it("overrideLinePrice sets new price + records original + grant", () => {
    const s = reducer(seeded, overrideLinePrice({ id: "L1", newPrice: 80, grant: "g", authorizerUserId: "mgr" }));
    expect(s.items[0].unitPrice).toBe(80);
    expect(s.items[0].priceOverride).toEqual({ originalPrice: 100, grant: "g", authorizerUserId: "mgr" });
  });
  it("voidLine removes the line", () => {
    const s = reducer(seeded, voidLine("L1"));
    expect(s.items).toHaveLength(0);
  });
  it("setDiscountOverride records + clears the cart-level grant", () => {
    const s = reducer(
      seeded,
      setDiscountOverride({ grant: "g", authorizerUserId: "mgr", mode: "percent", value: 25 }),
    );
    expect(s.discountOverride).toEqual({
      grant: "g",
      authorizerUserId: "mgr",
      mode: "percent",
      value: 25,
    });
    const s2 = reducer(s, setDiscountOverride(null));
    expect(s2.discountOverride).toBeNull();
  });
});

describe("cart slice park/resume re-auth (Phase 1.3b)", () => {
  const parked: CartState = {
    items: [item({ id: "L1", unitPrice: 80, reauth: { kind: "priceOverride", originalPrice: 100 } })],
    customerId: "cust1", storeId: "s1", shiftId: null, notes: "hold",
    storeProvince: "ON", discountOverride: null, discountReauth: { mode: "flat", value: 5 },
  };

  it("replaceCart hydrates the whole cart from a snapshot", () => {
    const s = reducer(undefined, replaceCart(parked));
    expect(s.customerId).toBe("cust1");
    expect(s.items[0].reauth).toEqual({ kind: "priceOverride", originalPrice: 100 });
    expect(s.discountReauth).toEqual({ mode: "flat", value: 5 });
  });

  it("resolveLineReauth re-attaches a fresh grant with the snapshot's original price and clears the marker", () => {
    const seeded = reducer(undefined, replaceCart(parked));
    const s = reducer(seeded, resolveLineReauth({ id: "L1", originalPrice: 100, grant: "fresh", authorizerUserId: "mgr" }));
    expect(s.items[0].priceOverride).toEqual({ originalPrice: 100, grant: "fresh", authorizerUserId: "mgr" });
    expect(s.items[0].reauth).toBeUndefined();
    expect(s.items[0].unitPrice).toBe(80); // price unchanged — only re-authorized
  });

  it("setDiscountOverride clears a pending discountReauth marker", () => {
    const seeded = reducer(undefined, replaceCart(parked));
    const s = reducer(seeded, setDiscountOverride({ grant: "fresh", authorizerUserId: "mgr", mode: "flat", value: 5 }));
    expect(s.discountReauth).toBeNull();
  });

  it("setDiscountReauth sets/clears the marker", () => {
    const s = reducer(undefined, setDiscountReauth({ mode: "percent", value: 30 }));
    expect(s.discountReauth).toEqual({ mode: "percent", value: 30 });
    expect(reducer(s, setDiscountReauth(null)).discountReauth).toBeNull();
  });

  it("overrideLinePrice clears a resume reauth marker", () => {
    const seeded = reducer(undefined, replaceCart(parked));
    const s = reducer(seeded, overrideLinePrice({ id: "L1", newPrice: 70, grant: "g", authorizerUserId: "mgr" }));
    expect(s.items[0].reauth).toBeUndefined();
    expect(s.items[0].unitPrice).toBe(70);
  });
});

describe("cart slice pharmacy (Phase 2.2)", () => {
  const seeded = reducer(undefined, addToCart(item({ id: "L1", unitPrice: 100 })));

  it("linkRx attaches the Rx and sets the line price to the copay", () => {
    const s = reducer(seeded, linkRx({ id: "L1", rxNumber: "12345", copay: 8.4 }));
    expect(s.items[0].rx).toEqual({ rxNumber: "12345", copay: 8.4 });
    expect(s.items[0].unitPrice).toBe(8.4);
  });

  it("linkRx without a copay keeps the price", () => {
    const s = reducer(seeded, linkRx({ id: "L1", rxNumber: "99" }));
    expect(s.items[0].unitPrice).toBe(100);
    expect(s.items[0].rx?.rxNumber).toBe("99");
  });

  it("unlinkRx removes the Rx", () => {
    const linked = reducer(seeded, linkRx({ id: "L1", rxNumber: "12345", copay: 8.4 }));
    const s = reducer(linked, unlinkRx("L1"));
    expect(s.items[0].rx).toBeUndefined();
  });

  it("setConsult records the ack + grant", () => {
    const s = reducer(seeded, setConsult({ id: "L1", grant: "g", authorizerUserId: "ph", context: "p1" }));
    expect(s.items[0].consultAck).toBe(true);
    expect(s.items[0].consultGrant).toEqual({ grant: "g", authorizerUserId: "ph", context: "p1" });
  });

  it("setLineSchedule stores the resolved category", () => {
    const s = reducer(seeded, setLineSchedule({ id: "L1", scheduleCategory: "NEEDS_RX" }));
    expect(s.items[0].scheduleCategory).toBe("NEEDS_RX");
  });
});
