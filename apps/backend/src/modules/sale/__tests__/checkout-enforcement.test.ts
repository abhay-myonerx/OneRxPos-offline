// 3H.7 — checkout enforces discount caps + credit limit server-side, fail-closed.
// Grants are minted via the real mintOverrideGrant (like the compliance harness).

import { createHash } from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("../../../config/database", () => ({ prisma: prismaMock }));
vi.mock("../../promotion/promotion-resolver", () => ({
  resolveForCart: vi.fn(async () => ({ lineDiscounts: {}, cartDiscount: "0", applied: [] })),
}));
vi.mock("../../inventory/reorder.service", () => ({ maybeReorder: vi.fn(async () => {}) }));

import { processCheckout } from "../checkout.service";
import { mintOverrideGrant } from "../../pos-auth/override-grant";
import type { CheckoutInput } from "../sale.validation";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
function grantFor(action: string, context: string): { action: string; context: string; grant: string } {
  return { action, context, grant: mintOverrideGrant({ action, authorizerUserId: "mgr-1", contextHash: sha256(context), jti: `jti-${context}` }) };
}

function makeTx() {
  return {
    invoiceSequence: { upsert: vi.fn().mockResolvedValue({ lastNumber: 1 }) },
    sale: { create: vi.fn(async ({ data }: any) => ({ id: "sale-1", invoiceNo: "INV-1", ...data })) },
    saleItem: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    rxLink: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    saleTaxLine: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    saleOverride: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    payment: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    storeStock: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findFirst: vi.fn().mockResolvedValue({ quantity: 9 }) },
    stockMovement: { create: vi.fn().mockResolvedValue({}) },
    loyaltyProgram: { findUnique: vi.fn().mockResolvedValue(null) },
    customer: { update: vi.fn().mockResolvedValue({}) },
    promotionRedemption: { create: vi.fn() },
    promotion: { update: vi.fn() },
  };
}

function makeDb(over: { customer?: any } = {}) {
  const product = {
    id: "prod-1", name: "Widget", productType: "STANDARD", costPrice: "5.00", isActive: true,
    taxCategory: "STANDARD", taxInclusive: false, taxGroup: null, variants: false, productLevies: [],
    categoryId: null, din: null, scheduleOverride: null,
  };
  return {
    store: { findUnique: vi.fn().mockResolvedValue({ id: "store-1", isActive: true, province: "BC" }) },
    tenant: { findUnique: vi.fn().mockResolvedValue({ settings: null }) }, // default caps (CASHIER 10%)
    user: { findUnique: vi.fn().mockResolvedValue({ role: "CASHIER" }) },
    customer: { findUnique: vi.fn().mockResolvedValue(over.customer ?? null) },
    loyaltyProgram: { findUnique: vi.fn().mockResolvedValue(null) }, // 3H.5: no loyalty in cap/credit tests
    cashierShift: { findFirst: vi.fn() },
    product: { findUnique: vi.fn().mockResolvedValue(product), findMany: vi.fn().mockResolvedValue([{ id: "prod-1", scheduleOverride: null }]) },
    drugProduct: { findMany: vi.fn().mockResolvedValue([]) },
    storeStock: { findFirst: vi.fn().mockResolvedValue({ quantity: 10 }) },
    sale: { findUnique: vi.fn().mockResolvedValue({ id: "sale-1", items: [], payments: [], taxLines: [] }) },
  };
}

function baseInput(over: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    storeId: "store-1", customerId: null, shiftId: null,
    items: [{ productId: "prod-1", variantId: null, quantity: 1, unitPrice: 100, discount: 0 }],
    payments: [{ method: "CASH", amount: 200, referenceNo: null, notes: null }],
    notes: null, exemption: null, cartDiscount: 0, cartDiscountMode: "flat", overrides: undefined, ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(makeTx()));
});

describe("discount-cap enforcement (CASHIER 10% cap)", () => {
  it("rejects a 20% cart discount with no override", async () => {
    await expect(
      processCheckout(makeDb() as never, "t1", "cashier-1", baseInput({ cartDiscount: 20, cartDiscountMode: "percent" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it("allows the 20% cart discount WITH a DISCOUNT_OVER_CAP grant", async () => {
    const sale = await processCheckout(
      makeDb() as never, "t1", "cashier-1",
      baseInput({ cartDiscount: 20, cartDiscountMode: "percent", overrides: [grantFor("DISCOUNT_OVER_CAP", "percent:20")] }),
    );
    expect(sale).toBeTruthy();
  });
  it("allows a within-cap 10% discount with no override", async () => {
    const sale = await processCheckout(makeDb() as never, "t1", "cashier-1", baseInput({ cartDiscount: 10, cartDiscountMode: "percent" }));
    expect(sale).toBeTruthy();
  });
  it("MANAGER may apply any discount with no override", async () => {
    const db = makeDb();
    db.user.findUnique = vi.fn().mockResolvedValue({ role: "MANAGER" });
    const sale = await processCheckout(db as never, "t1", "cashier-1", baseInput({ cartDiscount: 90, cartDiscountMode: "percent" }));
    expect(sale).toBeTruthy();
  });
});

describe("credit-limit enforcement", () => {
  const chargeCustomer = { id: "c1", isActive: true, creditLimit: "100", currentBalance: "50" };
  // Pay only 52 of the ~112 total → dueAmount ~60 → 50+60 = 110 > 100 limit.
  const chargeInput = () => baseInput({ customerId: "c1", payments: [{ method: "CASH", amount: 52, referenceNo: null, notes: null }] });

  it("rejects a charge that would exceed the credit limit, no override", async () => {
    await expect(
      processCheckout(makeDb({ customer: chargeCustomer }) as never, "t1", "cashier-1", chargeInput()),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it("allows it WITH a CREDIT_LIMIT_OVERRIDE grant", async () => {
    // dueAmount is deterministic (grandTotal 112 − 52 = 60).
    const sale = await processCheckout(
      makeDb({ customer: chargeCustomer }) as never, "t1", "cashier-1",
      { ...chargeInput(), overrides: [grantFor("CREDIT_LIMIT_OVERRIDE", "c1:60")] },
    );
    expect(sale).toBeTruthy();
  });
  it("allows a charge within the limit", async () => {
    const roomy = { id: "c1", isActive: true, creditLimit: "1000", currentBalance: "0" };
    const sale = await processCheckout(makeDb({ customer: roomy }) as never, "t1", "cashier-1", chargeInput());
    expect(sale).toBeTruthy();
  });
});
