// Checkout integration: manager-override grants (Phase 1.3a Task 9).
//
// Mirrors `checkout.pricing.test.ts`'s mocking pattern — mocks the base
// `prisma` client (used only for `$transaction`) and passes a plain mocked
// tenant-scoped `db` object directly as `processCheckout`'s first argument.
//
// `consumeOverride`/`verifyOverrideGrant` (from `../../pos-auth/override.service`)
// are used FOR REAL here (not mocked) — they are pure JWT verify/hash
// functions with no DB/audit side effects, so a grant minted via the real
// `mintOverrideGrant` round-trips through the real checkout code exactly as
// it would in production. Context strings are built with the SAME format as
// the frontend's `override-context.ts` (`${productId}:${old}->${new}`,
// raw JS `toString`, not rounded).

import { createHash } from "crypto";

import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));
vi.mock("../../../config/database", () => ({
  prisma: prismaMock,
}));

import { processCheckout } from "../checkout.service";
import type { CheckoutInput } from "../sale.validation";
import { mintOverrideGrant } from "../../pos-auth/override-grant";

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function grantFor(action: string, context: string, authorizerUserId = "mgr-1"): string {
  return mintOverrideGrant({ action, authorizerUserId, contextHash: sha256(context), jti: "jti-1" });
}

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
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    saleOverride: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
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

function baseInput(overrides?: CheckoutInput["overrides"]): CheckoutInput {
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
    overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processCheckout — manager-override grants (fail-closed)", () => {
  it("accepts a valid PRICE_OVERRIDE grant, completes the sale, and records exactly one SaleOverride row", async () => {
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));
    const db = makeDb(baseProduct);

    // Same format as the frontend's `override-context.ts` priceOverrideCtx:
    // `${productId}:${old}->${new}` — raw JS number toString, not rounded.
    const context = `prod-1:10->8.5`;
    const grant = grantFor("PRICE_OVERRIDE", context);

    const input = baseInput([{ action: "PRICE_OVERRIDE", context, grant }]);

    await processCheckout(db as never, "tenant-1", "cashier-1", input);

    expect(tx.sale.create).toHaveBeenCalledTimes(1);
    expect(tx.saleOverride.createMany).toHaveBeenCalledTimes(1);
    const overrideRows = tx.saleOverride.createMany.mock.calls[0][0].data as Array<{
      saleId: string;
      action: string;
      context: string;
      authorizerUserId: string;
      cashierId: string;
    }>;
    expect(overrideRows).toHaveLength(1);
    expect(overrideRows[0]).toMatchObject({
      saleId: "sale-1",
      action: "PRICE_OVERRIDE",
      context,
      authorizerUserId: "mgr-1",
      cashierId: "cashier-1",
    });
  });

  it("fails closed on an invalid/expired override grant — throws and NEVER calls sale.create", async () => {
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));
    const db = makeDb(baseProduct);

    const context = `prod-1:10->8.5`;
    // Grant minted for a DIFFERENT context than what's presented at checkout —
    // consumeOverride's contextHash binding must reject this.
    const grant = grantFor("PRICE_OVERRIDE", "prod-1:10->999");

    const input = baseInput([{ action: "PRICE_OVERRIDE", context, grant }]);

    await expect(processCheckout(db as never, "tenant-1", "cashier-1", input)).rejects.toThrow(
      /override/i,
    );
    expect(tx.sale.create).not.toHaveBeenCalled();
    expect(tx.saleOverride.createMany).not.toHaveBeenCalled();
  });

  it("fails closed on a garbage grant string — throws and NEVER calls sale.create", async () => {
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));
    const db = makeDb(baseProduct);

    const context = `prod-1:10->8.5`;
    const input = baseInput([{ action: "PRICE_OVERRIDE", context, grant: "not-a-real-jwt" }]);

    await expect(processCheckout(db as never, "tenant-1", "cashier-1", input)).rejects.toThrow(
      /override/i,
    );
    expect(tx.sale.create).not.toHaveBeenCalled();
  });
});
