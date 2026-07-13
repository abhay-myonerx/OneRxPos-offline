import { describe, it, expect } from "vitest";
import {
  serializeSnapshot,
  deserializeSnapshot,
  snapshotNeedsReauth,
} from "../parked-snapshot";
import type { CartItem, CartState } from "../../types/cart.types";

const item = (over: Partial<CartItem> = {}): CartItem => ({
  id: "L1", productId: "p1", name: "Widget", sku: "W1", unitPrice: 100, costPrice: 50,
  quantity: 1, discount: 0, taxCategory: "STANDARD", taxInclusive: false, levies: [], maxStock: 10, ...over,
});

const cart = (over: Partial<CartState> = {}): CartState => ({
  items: [], customerId: null, storeId: "s1", shiftId: null, notes: "",
  storeProvince: "ON", discountOverride: null, discountReauth: null, ...over,
});

describe("serializeSnapshot", () => {
  it("strips a price-override grant and leaves a reauth marker (price kept)", () => {
    const c = cart({
      items: [item({ unitPrice: 80, priceOverride: { originalPrice: 100, grant: "SECRET", authorizerUserId: "mgr" } })],
    });
    const snap = serializeSnapshot(c, 0, "flat");
    const line = snap.items[0];
    expect(line.unitPrice).toBe(80); // overridden price preserved
    expect("priceOverride" in line).toBe(false); // grant gone
    expect(JSON.stringify(snap)).not.toContain("SECRET"); // no grant token anywhere
    expect(line.reauth).toEqual({ kind: "priceOverride", originalPrice: 100 });
  });

  it("marks a misc/open-price line as openPriceItem reauth (no originalPrice)", () => {
    const c = cart({
      items: [item({ isMisc: true, unitPrice: 5, priceOverride: { originalPrice: 0, grant: "g", authorizerUserId: "mgr" } })],
    });
    const snap = serializeSnapshot(c, 0, "flat");
    expect(snap.items[0].reauth).toEqual({ kind: "openPriceItem" });
  });

  it("carries an over-cap discount grant into a discountReauth marker", () => {
    const c = cart({ discountOverride: { grant: "g", authorizerUserId: "mgr", mode: "percent", value: 25 } });
    const snap = serializeSnapshot(c, 25, "percent");
    expect(JSON.stringify(snap)).not.toContain('"grant"');
    expect(snap.discountReauth).toEqual({ mode: "percent", value: 25 });
    expect(snap.cartDiscount).toBe(25);
    expect(snap.cartDiscountMode).toBe("percent");
  });

  it("preserves an existing reauth marker when re-parking a resumed line", () => {
    const c = cart({ items: [item({ unitPrice: 80, reauth: { kind: "priceOverride", originalPrice: 100 } })] });
    const snap = serializeSnapshot(c, 0, "flat");
    expect(snap.items[0].reauth).toEqual({ kind: "priceOverride", originalPrice: 100 });
  });

  it("leaves a plain line untouched (no reauth)", () => {
    const snap = serializeSnapshot(cart({ items: [item()] }), 0, "flat");
    expect(snap.items[0].reauth).toBeUndefined();
  });
});

describe("deserializeSnapshot round-trip", () => {
  it("restores cart state + discount, forcing discountOverride null and keeping markers", () => {
    const c = cart({
      customerId: "cust1", notes: "hold for Jane",
      items: [item({ unitPrice: 80, priceOverride: { originalPrice: 100, grant: "g", authorizerUserId: "mgr" } })],
      discountOverride: { grant: "g", authorizerUserId: "mgr", mode: "flat", value: 5 },
    });
    const restored = deserializeSnapshot(serializeSnapshot(c, 5, "flat"));
    expect(restored.cartState.customerId).toBe("cust1");
    expect(restored.cartState.notes).toBe("hold for Jane");
    expect(restored.cartState.storeProvince).toBe("ON");
    expect(restored.cartState.discountOverride).toBeNull();
    expect(restored.cartState.items[0].unitPrice).toBe(80);
    expect(restored.cartState.items[0].reauth).toEqual({ kind: "priceOverride", originalPrice: 100 });
    expect(restored.cartState.discountReauth).toEqual({ mode: "flat", value: 5 });
    expect(restored.cartDiscount).toBe(5);
    expect(restored.cartDiscountMode).toBe("flat");
  });
});

describe("snapshotNeedsReauth", () => {
  it("is true when a line or the discount needs reauth, false otherwise", () => {
    expect(snapshotNeedsReauth(serializeSnapshot(cart({ items: [item()] }), 0, "flat"))).toBe(false);
    expect(
      snapshotNeedsReauth(serializeSnapshot(cart({ items: [item({ reauth: { kind: "openPriceItem" } })] }), 0, "flat")),
    ).toBe(true);
    expect(
      snapshotNeedsReauth(serializeSnapshot(cart({ discountReauth: { mode: "flat", value: 5 } }), 5, "flat")),
    ).toBe(true);
  });
});
