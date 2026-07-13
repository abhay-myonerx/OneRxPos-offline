// 3H.4 — checkout applies promotions server-side (via the resolver), taxes the
// discounted net, and persists a PromotionRedemption per applied promo. Models
// the checkout.compliance.test.ts harness (base prisma + a mocked tenant `db`).

import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("../../../config/database", () => ({ prisma: prismaMock }));

const resolveForCart = vi.hoisted(() => vi.fn());
vi.mock("../../promotion/promotion-resolver", () => ({ resolveForCart }));
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
    payment: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    storeStock: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findFirst: vi.fn().mockResolvedValue({ quantity: 9 }) },
    stockMovement: { create: vi.fn().mockResolvedValue({}) },
    loyaltyProgram: { findUnique: vi.fn().mockResolvedValue(null) },
    customer: { update: vi.fn().mockResolvedValue({}) },
    promotionRedemption: { create: vi.fn().mockResolvedValue({}) },
    promotion: { update: vi.fn().mockResolvedValue({}) },
  };
}

function makeDb() {
  const product = {
    id: "prod-1", name: "Widget", productType: "STANDARD", costPrice: "5.00", isActive: true,
    taxCategory: "STANDARD", taxInclusive: false, taxGroup: null, variants: false, productLevies: [],
    categoryId: null, din: null, scheduleOverride: null,
  };
  return {
    store: { findUnique: vi.fn().mockResolvedValue({ id: "store-1", isActive: true, province: "BC" }) },
    tenant: { findUnique: vi.fn().mockResolvedValue({ settings: null }) },
    customer: { findUnique: vi.fn() },
    cashierShift: { findFirst: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ role: "MANAGER" }) }, // 3H.7
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
  resolveForCart.mockResolvedValue({ lineDiscounts: {}, cartDiscount: "0", applied: [] });
});

describe("processCheckout — promotions (3H.4)", () => {
  it("applies a 10%-off promo so the persisted sale reflects the discounted net + tax", async () => {
    resolveForCart.mockResolvedValue({ lineDiscounts: { "prod-1": "10" }, cartDiscount: "0", applied: [{ promotionId: "promo-1", name: "10% off", amount: "10" }] });
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));
    await processCheckout(makeDb() as never, "tenant-1", "cashier-1", baseInput());

    // Sale subtotal should be the discounted net (100 - 10 = 90), not 100.
    const saleData = tx.sale.create.mock.calls[0][0].data;
    expect(Number(saleData.subtotal)).toBeCloseTo(90, 2);
    // A redemption row is persisted + the promo counter incremented.
    expect(tx.promotionRedemption.create).toHaveBeenCalledTimes(1);
    expect(tx.promotion.update).toHaveBeenCalledWith({ where: { id: "promo-1" }, data: { timesUsed: { increment: 1 } } });
  });

  it("skips the synthetic group pseudo-promo when persisting redemptions", async () => {
    resolveForCart.mockResolvedValue({ lineDiscounts: {}, cartDiscount: "5", applied: [{ promotionId: "__group__", name: "Customer group discount", amount: "5" }] });
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));
    await processCheckout(makeDb() as never, "tenant-1", "cashier-1", baseInput());
    expect(tx.promotionRedemption.create).not.toHaveBeenCalled();
  });

  it("with no promotions the sale is unchanged (subtotal 100)", async () => {
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));
    await processCheckout(makeDb() as never, "tenant-1", "cashier-1", baseInput());
    const saleData = tx.sale.create.mock.calls[0][0].data;
    expect(Number(saleData.subtotal)).toBeCloseTo(100, 2);
    expect(resolveForCart).toHaveBeenCalled();
  });
});
