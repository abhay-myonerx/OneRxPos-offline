// 3H.2 — checkout triggers the auto-reorder service AFTER commit with the
// post-sale stock quantities, and the sale is unaffected by reorder behaviour.
// Mirrors checkout.compliance.test.ts's mocking harness (base `prisma` +
// a plain mocked tenant-scoped `db`). Non-pharmacy tenant → plain cash sale.

import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("../../../config/database", () => ({ prisma: prismaMock }));

const maybeReorder = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../inventory/reorder.service", () => ({ maybeReorder }));

import { processCheckout } from "../checkout.service";
import type { CheckoutInput } from "../sale.validation";

function makeTx() {
  return {
    invoiceSequence: { upsert: vi.fn().mockResolvedValue({ lastNumber: 1 }) },
    sale: {
      create: vi.fn(async ({ data }: any) => ({ id: "sale-1", invoiceNo: "INV-1", ...data })),
    },
    saleItem: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    rxLink: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    saleTaxLine: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    saleOverride: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    payment: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    storeStock: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      // post-decrement quantity → the value fed to maybeReorder as newQty.
      findFirst: vi.fn().mockResolvedValue({ quantity: 2 }),
    },
    stockMovement: { create: vi.fn().mockResolvedValue({}) },
    loyaltyProgram: { findUnique: vi.fn().mockResolvedValue(null) },
    customer: { update: vi.fn().mockResolvedValue({}) },
  };
}

function makeDb() {
  const product = {
    id: "prod-1",
    name: "Widget",
    productType: "STANDARD",
    costPrice: "5.00",
    isActive: true,
    taxCategory: "STANDARD",
    taxInclusive: false,
    taxGroup: null,
    variants: false,
    productLevies: [],
    din: null,
    scheduleOverride: null,
  };
  return {
    store: { findUnique: vi.fn().mockResolvedValue({ id: "store-1", isActive: true, province: "BC" }) },
    tenant: { findUnique: vi.fn().mockResolvedValue({ settings: null }) }, // non-pharmacy
    customer: { findUnique: vi.fn() },
    cashierShift: { findFirst: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ role: "MANAGER" }) }, // 3H.7
    product: {
      findUnique: vi.fn().mockResolvedValue(product),
      findMany: vi.fn().mockResolvedValue([{ id: "prod-1", scheduleOverride: null }]),
    },
    drugProduct: { findMany: vi.fn().mockResolvedValue([]) },
    storeStock: { findFirst: vi.fn().mockResolvedValue({ quantity: 10 }) },
    sale: { findUnique: vi.fn().mockResolvedValue({ id: "sale-1", items: [], payments: [], taxLines: [] }) },
  };
}

function baseInput(): CheckoutInput {
  return {
    storeId: "store-1",
    customerId: null,
    shiftId: null,
    items: [{ productId: "prod-1", variantId: null, quantity: 1, unitPrice: 8.5, discount: 0 }],
    payments: [{ method: "CASH", amount: 20, referenceNo: null, notes: null }],
    notes: null,
    exemption: null,
    cartDiscount: 0,
    cartDiscountMode: "flat",
    overrides: undefined,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("processCheckout → auto-reorder trigger (3H.2)", () => {
  it("calls maybeReorder after commit with the post-sale quantities", async () => {
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(makeTx()));
    await processCheckout(makeDb() as never, "tenant-1", "cashier-1", baseInput());

    expect(maybeReorder).toHaveBeenCalledTimes(1);
    const [, ctx, affected] = maybeReorder.mock.calls[0] as unknown[];
    expect(ctx).toEqual({ tenantId: "tenant-1", storeId: "store-1" });
    expect(affected).toEqual([{ productId: "prod-1", variantId: null, newQty: 2 }]);
  });

  it("the sale still completes when maybeReorder rejects (fire-and-forget)", async () => {
    maybeReorder.mockRejectedValueOnce(new Error("reorder boom"));
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(makeTx()));
    const sale = await processCheckout(makeDb() as never, "tenant-1", "cashier-1", baseInput());
    expect(sale).toBeTruthy();
  });
});
