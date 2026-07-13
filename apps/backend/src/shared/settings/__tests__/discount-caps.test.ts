import { describe, it, expect } from "vitest";
import { getDiscountCaps, DEFAULT_ROLE_CAPS } from "../discount-caps";

describe("getDiscountCaps", () => {
  it("returns defaults when settings absent", () => {
    expect(getDiscountCaps({})).toEqual(DEFAULT_ROLE_CAPS);
    expect(getDiscountCaps(null)).toEqual(DEFAULT_ROLE_CAPS);
  });
  it("merges a tenant override over defaults", () => {
    const caps = getDiscountCaps({ discountCaps: { CASHIER: { percent: 5, flat: null } } });
    expect(caps.CASHIER).toEqual({ percent: 5, flat: null });
    expect(caps.MANAGER).toEqual(DEFAULT_ROLE_CAPS.MANAGER);
  });
});
