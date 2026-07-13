// 3H.5 — checkout redeems loyalty points as a LOYALTY tender (tax-neutral,
// fail-closed) and earns with the tier multiplier.

import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("../../../config/database", () => ({ prisma: prismaMock }));
vi.mock("../../promotion/promotion-resolver", () => ({
  resolveForCart: vi.fn(async () => ({ lineDiscounts: {}, cartDiscount: "0", applied: [] })),
}));
vi.mock("../../inventory/reorder.service", () => ({ maybeReorder: vi.fn(async () => {}) }));

import { processCheckout } from "../checkout.service";
import type { CheckoutInput } from "../sale.validation";

function makeTx() {
  return {
    invoiceSequence: { upsert: vi.fn().mockResolvedValue({ lastNumber: 1 }) },
    sale: { create: vi.fn(async ({ data }: any) => ({ id: "sale-1", invoiceNo: "INV-1", ...data })) },
    saleItem: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    rxLink: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    saleTaxLine: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    saleOverride: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    payment: { createMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn().mockResolvedValue({}) },
    storeStock: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findFirst: vi.fn().mockResolvedValue({ quantity: 9 }) },
    stockMovement: { create: vi.fn().mockResolvedValue({}) },
    loyaltyProgram: { findUnique: vi.fn() },
    loyaltyTransaction: { create: vi.fn().mockResolvedValue({}) },
    customer: { update: vi.fn().mockResolvedValue({}) },
    promotionRedemption: { create: vi.fn() },
    promotion: { update: vi.fn() },
  };
}
let tx: ReturnType<typeof makeTx>;

function makeDb(over: { program?: any; customer?: any } = {}) {
  const product = {
    id: "prod-1", name: "Widget", productType: "STANDARD", costPrice: "5.00", isActive: true,
    taxCategory: "STANDARD", taxInclusive: false, taxGroup: null, variants: false, productLevies: [],
    categoryId: null, din: null, scheduleOverride: null,
  };
  const program = over.program ?? { isActive: true, earnRate: "1", redeemRate: "0.1", minRedeemPoints: 100, tiers: [] };
  const customer = over.customer ?? { id: "c1", isActive: true, loyaltyPoints: 500, creditLimit: "0", currentBalance: "0" };
  return {
    store: { findUnique: vi.fn().mockResolvedValue({ id: "store-1", isActive: true, province: "BC" }) },
    tenant: { findUnique: vi.fn().mockResolvedValue({ settings: null }) },
    user: { findUnique: vi.fn().mockResolvedValue({ role: "MANAGER" }) },
    customer: { findUnique: vi.fn().mockResolvedValue(customer) },
    loyaltyProgram: { findUnique: vi.fn().mockResolvedValue(program) },
    cashierShift: { findFirst: vi.fn() },
    product: { findUnique: vi.fn().mockResolvedValue(product), findMany: vi.fn().mockResolvedValue([{ id: "prod-1", scheduleOverride: null }]) },
    drugProduct: { findMany: vi.fn().mockResolvedValue([]) },
    storeStock: { findFirst: vi.fn().mockResolvedValue({ quantity: 10 }) },
    sale: { findUnique: vi.fn().mockResolvedValue({ id: "sale-1", items: [], payments: [], taxLines: [] }) },
  };
}

function baseInput(over: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    storeId: "store-1", customerId: "c1", shiftId: null,
    items: [{ productId: "prod-1", variantId: null, quantity: 1, unitPrice: 100, discount: 0 }],
    payments: [{ method: "CASH", amount: 92, referenceNo: null, notes: null }], // + 20 loyalty = 112 total
    notes: null, exemption: null, cartDiscount: 0, cartDiscountMode: "flat", overrides: undefined, ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tx = makeTx();
  prismaMock.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));
});

describe("loyalty redemption", () => {
  it("redeems 200 points as a $20 LOYALTY tender, decrements points, writes REDEEMED", async () => {
    await processCheckout(makeDb() as never, "t1", "cashier-1", baseInput({ redeemPoints: 200 }));
    // A LOYALTY payment of 20 is written.
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ method: "LOYALTY", amount: 20 }) }),
    );
    // Points decremented by 200.
    expect(tx.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { loyaltyPoints: { decrement: 200 } } }),
    );
    // A REDEEMED transaction is recorded.
    const kinds = tx.loyaltyTransaction.create.mock.calls.map((c: any) => c[0].data.type);
    expect(kinds).toContain("REDEEMED");
    // Sale is fully paid (92 cash + 20 points = 112).
    const saleData = tx.sale.create.mock.calls[0][0].data;
    expect(saleData.status).toBe("COMPLETED");
  });

  it("rejects below the minimum redemption", async () => {
    await expect(
      processCheckout(makeDb() as never, "t1", "cashier-1", baseInput({ redeemPoints: 50 })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects redeeming more than the customer holds", async () => {
    await expect(
      processCheckout(makeDb() as never, "t1", "cashier-1", baseInput({ redeemPoints: 9999 })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("a normal sale without redemption is unchanged", async () => {
    await processCheckout(makeDb() as never, "t1", "cashier-1", baseInput({ payments: [{ method: "CASH", amount: 200, referenceNo: null, notes: null }] }));
    expect(tx.payment.create).not.toHaveBeenCalled(); // no LOYALTY tender
  });
});

describe("tier earn multiplier", () => {
  it("earns floor(grandTotal × earnRate × tierMultiplier)", async () => {
    const program = { isActive: true, earnRate: "1", redeemRate: "0.1", minRedeemPoints: 100, tiers: [{ minSpend: "100", multiplier: "2" }] };
    await processCheckout(
      makeDb({ program }) as never, "t1", "cashier-1",
      baseInput({ payments: [{ method: "CASH", amount: 200, referenceNo: null, notes: null }] }),
    );
    // grandTotal 112 × 1 × 2 = 224 earned.
    const earned = tx.loyaltyTransaction.create.mock.calls.find((c: any) => c[0].data.type === "EARNED");
    expect(earned?.[0].data.points).toBe(224);
  });

  it("no tiers → multiplier 1 (earn = earnRate)", async () => {
    await processCheckout(
      makeDb() as never, "t1", "cashier-1",
      baseInput({ payments: [{ method: "CASH", amount: 200, referenceNo: null, notes: null }] }),
    );
    const earned = tx.loyaltyTransaction.create.mock.calls.find((c: any) => c[0].data.type === "EARNED");
    expect(earned?.[0].data.points).toBe(112);
  });
});
