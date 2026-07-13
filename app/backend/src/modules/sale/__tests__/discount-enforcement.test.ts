import { describe, it, expect } from "vitest";
import { enforceDiscountCaps, enforceCreditLimit } from "../discount-enforcement";
import { DEFAULT_ROLE_CAPS } from "rx-pos-shared";

const caps = DEFAULT_ROLE_CAPS;

describe("enforceDiscountCaps", () => {
  const base = { role: "CASHIER", caps, cartDiscountMode: "percent" as const, subtotal: 100, lines: [], accepted: [] };

  it("rejects an over-cap cart discount with no grant", () => {
    expect(() =>
      enforceDiscountCaps({ ...base, cartDiscount: 20 }),
    ).toThrow(/exceeds your role/);
  });
  it("allows an over-cap cart discount WITH a matching grant", () => {
    expect(() =>
      enforceDiscountCaps({ ...base, cartDiscount: 20, accepted: [{ action: "DISCOUNT_OVER_CAP", context: "percent:20" }] }),
    ).not.toThrow();
  });
  it("allows a within-cap discount with no grant", () => {
    expect(() => enforceDiscountCaps({ ...base, cartDiscount: 10 })).not.toThrow();
  });
  it("rejects an over-cap line discount; allows it with a flat:<value> grant", () => {
    const line = { discount: 50, base: 100 }; // 50% > 10%
    expect(() => enforceDiscountCaps({ ...base, cartDiscount: 0, lines: [line] })).toThrow();
    expect(() =>
      enforceDiscountCaps({ ...base, cartDiscount: 0, lines: [line], accepted: [{ action: "DISCOUNT_OVER_CAP", context: "flat:50" }] }),
    ).not.toThrow();
  });
  it("MANAGER (null caps) → any discount allowed, no grant", () => {
    expect(() =>
      enforceDiscountCaps({ ...base, role: "MANAGER", cartDiscount: 90, lines: [{ discount: 500, base: 100 }] }),
    ).not.toThrow();
  });
});

describe("enforceCreditLimit", () => {
  const base = { customerId: "c1", accepted: [] as { action: string; context: string }[] };

  it("rejects a charge that pushes balance past the limit, no grant", () => {
    expect(() =>
      enforceCreditLimit({ ...base, dueAmount: 60, creditLimit: 100, currentBalance: 50 }),
    ).toThrow(/credit limit/);
  });
  it("allows it with a CREDIT_LIMIT_OVERRIDE grant", () => {
    expect(() =>
      enforceCreditLimit({ ...base, dueAmount: 60, creditLimit: 100, currentBalance: 50, accepted: [{ action: "CREDIT_LIMIT_OVERRIDE", context: "c1:60" }] }),
    ).not.toThrow();
  });
  it("allows a charge within the limit", () => {
    expect(() => enforceCreditLimit({ ...base, dueAmount: 40, creditLimit: 100, currentBalance: 50 })).not.toThrow();
  });
  it("no limit (creditLimit=0) → always allowed", () => {
    expect(() => enforceCreditLimit({ ...base, dueAmount: 9999, creditLimit: 0, currentBalance: 0 })).not.toThrow();
  });
  it("fully-paid sale (dueAmount=0) → never checked", () => {
    expect(() => enforceCreditLimit({ ...base, dueAmount: 0, creditLimit: 1, currentBalance: 100 })).not.toThrow();
  });
  it("exactly at the limit is allowed (strict >)", () => {
    expect(() => enforceCreditLimit({ ...base, dueAmount: 50, creditLimit: 100, currentBalance: 50 })).not.toThrow();
  });
});
