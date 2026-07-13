// Checkout integration: Phase 2.2 sector compliance (schedule enforcement +
// Rx-at-till). Mirrors `checkout.overrides.test.ts`'s mocking pattern — mocks
// the base `prisma` client (used only for `$transaction`) and passes a plain
// mocked tenant-scoped `db` object as `processCheckout`'s first argument.
//
// The pharmacy compliance hook + `consumeOverride`/`verifyOverrideGrant` run
// FOR REAL here (pure functions with no DB/audit side effects). A grant minted
// via the real `mintOverrideGrant` round-trips through the real checkout code.
//
// Schedule is driven by seeding the GLOBAL DrugProduct catalog (via
// `drugProduct.findMany`) keyed by the line's DIN — the real
// `resolveCartSchedules` path.

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
import { DrugScheduleCategory } from "../../../generated/prisma/enums";

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function grantFor(action: string, context: string, authorizerUserId = "mgr-1"): string {
  return mintOverrideGrant({ action, authorizerUserId, contextHash: sha256(context), jti: "jti-1" });
}

function makeTx() {
  return {
    invoiceSequence: { upsert: vi.fn().mockResolvedValue({ lastNumber: 1 }) },
    sale: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "sale-1",
        invoiceNo: "INV-1",
        ...data,
      })),
    },
    saleItem: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    rxLink: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    saleTaxLine: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    saleOverride: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    payment: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    storeStock: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({ quantity: 9 }),
    },
    stockMovement: { create: vi.fn().mockResolvedValue({}) },
    loyaltyProgram: { findUnique: vi.fn().mockResolvedValue(null) },
    customer: { update: vi.fn().mockResolvedValue({}) },
  };
}

const DIN = "00000001";

// `pharmacyEnabled` toggles the tenant's sector; `scheduleCategory` drives the
// DrugProduct catalog row the line's DIN resolves to.
function makeDb(opts: { pharmacyEnabled: boolean; scheduleCategory: DrugScheduleCategory }) {
  const product = {
    id: "prod-1",
    name: "Test Drug",
    productType: "STANDARD",
    costPrice: "5.00",
    isActive: true,
    taxCategory: "STANDARD",
    taxInclusive: false,
    taxGroup: null,
    variants: false,
    productLevies: [],
    din: DIN,
    scheduleOverride: null,
  };
  return {
    store: {
      findUnique: vi.fn().mockResolvedValue({ id: "store-1", isActive: true, province: "BC" }),
    },
    tenant: {
      findUnique: vi.fn().mockResolvedValue({
        settings: opts.pharmacyEnabled ? { enabledSectors: { pharmacy: true } } : null,
      }),
    },
    customer: { findUnique: vi.fn() },
    cashierShift: { findFirst: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ role: "MANAGER" }) }, // 3H.7: uncapped for non-cap tests
    product: {
      findUnique: vi.fn().mockResolvedValue(product),
      // resolveCartSchedules: per-product override lookup (none here).
      findMany: vi.fn().mockResolvedValue([{ id: "prod-1", scheduleOverride: null }]),
    },
    // resolveCartSchedules: GLOBAL catalog category resolved by DIN.
    drugProduct: {
      findMany: vi.fn().mockResolvedValue([{ din: DIN, scheduleCategory: opts.scheduleCategory }]),
    },
    storeStock: { findFirst: vi.fn().mockResolvedValue({ quantity: 10 }) },
    sale: { findUnique: vi.fn().mockResolvedValue({ id: "sale-1" }) },
  };
}

function baseInput(
  patch?: Partial<CheckoutInput["items"][number]>,
  overrides?: CheckoutInput["overrides"],
): CheckoutInput {
  return {
    storeId: "store-1",
    customerId: null,
    shiftId: null,
    items: [{ productId: "prod-1", variantId: null, quantity: 1, unitPrice: 8.5, discount: 0, ...patch }],
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

describe("processCheckout — Phase 2.2 sector compliance (fail-closed)", () => {
  it("(a) NEEDS_RX line with no Rx → 403 RX_REQUIRED, no sale/item/stock written", async () => {
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));
    const db = makeDb({ pharmacyEnabled: true, scheduleCategory: DrugScheduleCategory.NEEDS_RX });

    await expect(
      processCheckout(db as never, "tenant-1", "cashier-1", baseInput()),
    ).rejects.toMatchObject({ statusCode: 403, code: "RX_REQUIRED" });

    expect(tx.sale.create).not.toHaveBeenCalled();
    expect(tx.saleItem.createMany).not.toHaveBeenCalled();
    expect(tx.rxLink.createMany).not.toHaveBeenCalled();
    expect(tx.storeStock.updateMany).not.toHaveBeenCalled();
  });

  it("(b) NEEDS_RX line WITH an Rx → sale succeeds + RxLink row persisted", async () => {
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));
    const db = makeDb({ pharmacyEnabled: true, scheduleCategory: DrugScheduleCategory.NEEDS_RX });

    await processCheckout(
      db as never,
      "tenant-1",
      "cashier-1",
      baseInput({ rx: { rxNumber: "RX-123", copay: 4.5 } }),
    );

    expect(tx.sale.create).toHaveBeenCalledTimes(1);
    expect(tx.rxLink.createMany).toHaveBeenCalledTimes(1);
    const rows = tx.rxLink.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: "tenant-1",
      saleId: "sale-1",
      productId: "prod-1",
      din: DIN,
      rxNumber: "RX-123",
      copay: 4.5,
      consultAck: false,
    });
  });

  it("(c) BEHIND_COUNTER line: no consult → 403 CONSULT_REQUIRED; with RX_CONSULT override → sale succeeds", async () => {
    // No consult → blocked.
    const txBlocked = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txBlocked));
    const dbBlocked = makeDb({
      pharmacyEnabled: true,
      scheduleCategory: DrugScheduleCategory.BEHIND_COUNTER,
    });

    await expect(
      processCheckout(dbBlocked as never, "tenant-1", "cashier-1", baseInput()),
    ).rejects.toMatchObject({ statusCode: 403, code: "CONSULT_REQUIRED" });
    expect(txBlocked.sale.create).not.toHaveBeenCalled();

    // With an RX_CONSULT override (context = productId) → allowed + audited.
    const txOk = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txOk));
    const dbOk = makeDb({
      pharmacyEnabled: true,
      scheduleCategory: DrugScheduleCategory.BEHIND_COUNTER,
    });

    const context = "prod-1";
    const grant = grantFor("RX_CONSULT", context);
    await processCheckout(
      dbOk as never,
      "tenant-1",
      "cashier-1",
      baseInput(undefined, [{ action: "RX_CONSULT", context, grant }]),
    );

    expect(txOk.sale.create).toHaveBeenCalledTimes(1);
    // The consumed RX_CONSULT is audited as a SaleOverride row (audit for free).
    expect(txOk.saleOverride.createMany).toHaveBeenCalledTimes(1);
    const overrideRows = txOk.saleOverride.createMany.mock.calls[0][0].data as Array<{
      action: string;
      context: string;
    }>;
    expect(overrideRows[0]).toMatchObject({ action: "RX_CONSULT", context: "prod-1" });
  });

  it("(d) a NON-pharmacy tenant checks out a NEEDS_RX product with no Rx (compliance is a no-op)", async () => {
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));
    const db = makeDb({ pharmacyEnabled: false, scheduleCategory: DrugScheduleCategory.NEEDS_RX });

    await processCheckout(db as never, "tenant-1", "cashier-1", baseInput());

    expect(tx.sale.create).toHaveBeenCalledTimes(1);
    expect(tx.rxLink.createMany).not.toHaveBeenCalled();
    // Sector off → schedule resolution is never even queried.
    expect(db.drugProduct.findMany).not.toHaveBeenCalled();
  });
});
