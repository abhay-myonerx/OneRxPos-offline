import { describe, it, expect, vi, beforeEach } from "vitest";
import { priceCart, toDisplay } from "rx-pos-shared";

describe("backend consumes rx-pos-shared (no-drift smoke)", () => {
  it("ON $100 STANDARD -> 113.00 via the shared engine", () => {
    const r = priceCart({
      province: "ON", at: new Date("2026-07-05"), exemption: null,
      cartDiscount: { mode: "flat", value: "0" },
      lines: [{ id: "l1", unitPrice: "100", qty: "1", lineDiscount: "0",
        taxCategory: "STANDARD", taxInclusive: false, levies: [] }],
    });
    expect(toDisplay(r.grandTotal)).toBe("113.00");
  });
});

// ── Checkout integration: priceCart wiring + persistence ────────────────────
//
// Mocks the base `prisma` client (used only for `$transaction`) the same way
// `notification.service.test.ts` does — `vi.hoisted` + `vi.mock("../../../
// config/database", ...)` — and passes a plain mocked tenant-scoped `db`
// object directly as `processCheckout`'s first argument (it's just a
// parameter, no module mock needed for it). Assertions read the arguments
// actually passed to the mocked Prisma write calls (what would really be
// persisted), not echoed-back mock return values.

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));
vi.mock("../../../config/database", () => ({
  prisma: prismaMock,
}));

import { processCheckout } from "../checkout.service";
import type { CheckoutInput } from "../sale.validation";

function makeTx() {
  return {
    invoiceSequence: {
      upsert: vi.fn().mockResolvedValue({ lastNumber: 1 }),
    },
    sale: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "sale-1",
        invoiceNo: "INV-1",
        ...data,
      })),
    },
    saleItem: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    saleTaxLine: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    payment: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    storeStock: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({ quantity: 9 }),
    },
    stockMovement: {
      create: vi.fn().mockResolvedValue({}),
    },
    loyaltyProgram: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    customer: {
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function makeDb(product: Record<string, unknown>) {
  return {
    store: {
      findUnique: vi.fn().mockResolvedValue({
        id: "store-1",
        isActive: true,
        province: "BC",
      }),
    },
    // Non-pharmacy tenant (settings empty) → no active sector → compliance is a
    // no-op. Phase 2.2 checkout reads the tenant's enabled sectors here.
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ settings: null }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ role: "MANAGER" }) }, // 3H.7: uncapped
    customer: {
      findUnique: vi.fn(),
    },
    cashierShift: {
      findFirst: vi.fn(),
    },
    product: {
      findUnique: vi.fn().mockResolvedValue(product),
    },
    storeStock: {
      findFirst: vi.fn().mockResolvedValue({ quantity: 10 }),
    },
    sale: {
      findUnique: vi.fn().mockResolvedValue({ id: "sale-1" }),
    },
  };
}

const baseProduct = {
  id: "prod-1",
  name: "Test Product",
  productType: "STANDARD",
  costPrice: "5.00",
  isActive: true,
  taxCategory: "STANDARD",
  taxInclusive: false,
  taxGroup: null,
  variants: false,
  productLevies: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processCheckout — priceCart wiring + tax/rounding persistence", () => {
  it("BC cash sale of one $10.03 STANDARD item persists roundingAdjustment=0.02 and GST+PST tax lines", async () => {
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));
    const db = makeDb(baseProduct);

    const input: CheckoutInput = {
      storeId: "store-1",
      customerId: null,
      shiftId: null,
      items: [{ productId: "prod-1", variantId: null, quantity: 1, unitPrice: 10.03, discount: 0 }],
      payments: [{ method: "CASH", amount: 11.25, referenceNo: null, notes: null }],
      notes: null,
      exemption: null,
      cartDiscount: 0,
      cartDiscountMode: "flat",
    };

    await processCheckout(db as never, "tenant-1", "cashier-1", input);

    // Sale row: rounding + totals reflect the shared engine + nickel rounding.
    expect(tx.sale.create).toHaveBeenCalledTimes(1);
    const saleData = tx.sale.create.mock.calls[0][0].data;
    expect(saleData.subtotal).toBe(10.03);
    expect(saleData.taxTotal).toBe(1.2); // GST 0.50 + PST 0.70
    expect(saleData.levyTotal).toBe(0);
    expect(saleData.roundingAdjustment).toBe(0.02);
    expect(saleData.grandTotal).toBe(11.25); // 11.23 rounded up to the nearest nickel
    expect(saleData.changeAmount).toBe(0);
    expect(saleData.dueAmount).toBe(0);
    expect(saleData.status).toBe("COMPLETED");

    // Two SaleTaxLine rows: GST + PST, matching the BC profile (5% + 7%).
    expect(tx.saleTaxLine.createMany).toHaveBeenCalledTimes(1);
    const taxLines = tx.saleTaxLine.createMany.mock.calls[0][0].data as Array<{
      componentCode: string;
      base: number;
      amount: number;
    }>;
    expect(taxLines).toHaveLength(2);
    const byCode = Object.fromEntries(taxLines.map((t) => [t.componentCode, t]));
    expect(byCode.GST.base).toBe(10.03);
    expect(byCode.GST.amount).toBe(0.5);
    expect(byCode.PST.base).toBe(10.03);
    expect(byCode.PST.amount).toBe(0.7);

    // SaleItem: unit price/tax amount sourced from the priced line, not the raw
    // input. The engine rounds each tax COMPONENT once at the cart level (see
    // price-cart.ts), so the per-line taxAmount/lineTotal are full-precision
    // (4dp) and can differ by sub-cent amounts from the rounded aggregate
    // (Sale.taxTotal / SaleTaxLine.amount) — by design, not a bug.
    expect(tx.saleItem.createMany).toHaveBeenCalledTimes(1);
    const items = tx.saleItem.createMany.mock.calls[0][0].data as Array<{
      unitPrice: number;
      taxAmount: number;
      lineTotal: number;
    }>;
    expect(items).toHaveLength(1);
    expect(items[0].unitPrice).toBe(10.03);
    expect(items[0].taxAmount).toBe(1.2036); // 0.5015 (GST) + 0.7021 (PST), full precision
    expect(items[0].lineTotal).toBe(11.2336); // net + full-precision tax; the sale's rounding lives on Sale.roundingAdjustment
  });

  it("excludes expired/inactive levies from levyTotal + taxed base, but charges an active one", async () => {
    const pastEffectiveFrom = new Date("2020-01-01");

    const expiredLeviesProduct = {
      ...baseProduct,
      productLevies: [
        // Expired by date: effectiveTo is in the past.
        {
          levy: {
            code: "OLD_ENVIRO", name: "Old Environmental Fee", mode: "FLAT_PER_UNIT",
            amount: "2.00", taxable: true,
            isActive: true, effectiveFrom: pastEffectiveFrom, effectiveTo: new Date("2020-12-31"),
          },
        },
        // Deactivated: isActive false, no expiry date.
        {
          levy: {
            code: "INACTIVE_FEE", name: "Deactivated Fee", mode: "FLAT_PER_UNIT",
            amount: "3.00", taxable: true,
            isActive: false, effectiveFrom: pastEffectiveFrom, effectiveTo: null,
          },
        },
      ],
    };

    const txExpired = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txExpired));
    const dbExpired = makeDb(expiredLeviesProduct);

    const input: CheckoutInput = {
      storeId: "store-1",
      customerId: null,
      shiftId: null,
      items: [{ productId: "prod-1", variantId: null, quantity: 1, unitPrice: 10.03, discount: 0 }],
      payments: [{ method: "CASH", amount: 11.25, referenceNo: null, notes: null }],
      notes: null,
      exemption: null,
      cartDiscount: 0,
      cartDiscountMode: "flat",
    };

    await processCheckout(dbExpired as never, "tenant-1", "cashier-1", input);

    const expiredSaleData = txExpired.sale.create.mock.calls[0][0].data;
    expect(expiredSaleData.levyTotal).toBe(0);
    expect(expiredSaleData.taxTotal).toBe(1.2); // unaffected by the expired/inactive levies

    const expiredTaxLines = txExpired.saleTaxLine.createMany.mock.calls[0][0].data as Array<{
      componentCode: string;
      base: number;
    }>;
    // Taxed base is the plain product net (10.03), NOT inflated by the levy amounts.
    for (const line of expiredTaxLines) {
      expect(line.base).toBe(10.03);
    }

    // Contrast: an active levy (same shape, no expiry, isActive true) IS charged.
    const activeLevyProduct = {
      ...baseProduct,
      productLevies: [
        {
          levy: {
            code: "ENVIRO", name: "Environmental Fee", mode: "FLAT_PER_UNIT",
            amount: "2.00", taxable: true,
            isActive: true, effectiveFrom: pastEffectiveFrom, effectiveTo: null,
          },
        },
      ],
    };

    const txActive = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txActive));
    const dbActive = makeDb(activeLevyProduct);

    await processCheckout(dbActive as never, "tenant-1", "cashier-1", input);

    const activeSaleData = txActive.sale.create.mock.calls[0][0].data;
    expect(activeSaleData.levyTotal).toBe(2); // $2.00 FLAT_PER_UNIT levy charged
    const activeTaxLines = txActive.saleTaxLine.createMany.mock.calls[0][0].data as Array<{
      componentCode: string;
      base: number;
    }>;
    for (const line of activeTaxLines) {
      expect(line.base).toBe(12.03); // taxed base includes the taxable levy: 10.03 + 2.00
    }
  });

  it("does not inflate grandTotal when a non-cash tender alone exceeds the priced total", async () => {
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));
    const db = makeDb(baseProduct);

    const input: CheckoutInput = {
      storeId: "store-1",
      customerId: null,
      shiftId: null,
      items: [{ productId: "prod-1", variantId: null, quantity: 1, unitPrice: 10.03, discount: 0 }],
      // priced.grandTotal for this cart is 11.23 (10.03 + 0.50 GST + 0.70 PST).
      // CARD alone (15) already exceeds it; CASH (5) is also tendered on top —
      // the old code inflated grandTotal to nonCashPaid + roundedCashDue (15).
      payments: [
        { method: "CARD", amount: 15, referenceNo: "ref-1", notes: null },
        { method: "CASH", amount: 5, referenceNo: null, notes: null },
      ],
      notes: null,
      exemption: null,
      cartDiscount: 0,
      cartDiscountMode: "flat",
    };

    await processCheckout(db as never, "tenant-1", "cashier-1", input);

    const saleData = tx.sale.create.mock.calls[0][0].data;
    // Persisted grandTotal must equal the true priced total (± cash rounding),
    // never the over-tendered amount.
    expect(saleData.grandTotal).toBe(11.23);
    expect(saleData.roundingAdjustment).toBe(0);
    expect(saleData.grandTotal).toBeLessThanOrEqual(11.23);

    // Change/due math still holds: all $5 cash is returned as change since the
    // card payment alone already covered the total.
    expect(saleData.changeAmount).toBe(5);
    expect(saleData.dueAmount).toBe(0);
    expect(saleData.status).toBe("COMPLETED");
  });

  it("fails closed when the store has no province set", async () => {
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));
    const db = makeDb(baseProduct);
    db.store.findUnique = vi.fn().mockResolvedValue({ id: "store-1", isActive: true, province: null });

    const input: CheckoutInput = {
      storeId: "store-1",
      customerId: null,
      shiftId: null,
      items: [{ productId: "prod-1", variantId: null, quantity: 1, unitPrice: 10, discount: 0 }],
      payments: [{ method: "CASH", amount: 20, referenceNo: null, notes: null }],
      notes: null,
      exemption: null,
      cartDiscount: 0,
      cartDiscountMode: "flat",
    };

    await expect(processCheckout(db as never, "tenant-1", "cashier-1", input)).rejects.toThrow(
      /province/i,
    );
    expect(tx.sale.create).not.toHaveBeenCalled();
  });
});
