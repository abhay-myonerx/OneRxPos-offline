// Focused coverage for the Phase 1.2 Pricing Brain additions to the
// Product service: `taxCategory` / `taxInclusive` persistence and the
// `productLevies` (levyIds) sync on create/update. Mocks the Prisma
// delegate the same way sibling module tests do (see
// `src/modules/brand/__tests__/brand.service.test.ts`); no heavier
// harness is warranted per the task brief.

import { describe, it, expect, vi } from "vitest";

import * as service from "../product.service";
import { createProductSchema, updateProductSchema } from "../product.validation";

function makeDb(impl: Partial<Record<string, Partial<Record<string, ReturnType<typeof vi.fn>>>>> = {}): any {
  const db: any = {
    product: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      ...impl.product,
    },
    productVariant: {
      findFirst: vi.fn().mockResolvedValue(null),
      ...impl.productVariant,
    },
    category: {
      findUnique: vi.fn().mockResolvedValue({ id: "cat-1" }),
      ...impl.category,
    },
    taxGroup: {
      findUnique: vi.fn().mockResolvedValue({ id: "tg-1" }),
      ...impl.taxGroup,
    },
    levy: {
      findUnique: vi.fn().mockResolvedValue({ id: "levy-1", tenantId: "tenant-1" }),
      ...impl.levy,
    },
    productLevy: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      ...impl.productLevy,
    },
  };
  // updateProduct wraps the levy delete/recreate + product.update in a single
  // db.$transaction(async (tx) => ...) call — mock it by just invoking the
  // callback with the same mocked delegates (tx === db here).
  db.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(db));
  return db;
}

const baseCreateInput = {
  name: "Widget",
  sku: "WID-1",
  productType: "STANDARD" as const,
  costPrice: 5,
  sellPrice: 10,
  taxCategory: "STANDARD" as const,
  taxInclusive: false,
};

describe("product.service.createProduct — tax fields + levy sync", () => {
  it("persists taxCategory and taxInclusive on the created row", async () => {
    const created = { id: "prod-1", sku: "WID-1", name: "Widget" };
    const db = makeDb({ product: { create: vi.fn().mockResolvedValue(created) } });

    await service.createProduct(db, "tenant-1", {
      ...baseCreateInput,
      taxCategory: "ZERO_RATED",
      taxInclusive: true,
    });

    expect(db.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taxCategory: "ZERO_RATED",
          taxInclusive: true,
        }),
      }),
    );
  });

  it("binds levyIds inline via a nested productLevies create", async () => {
    const created = { id: "prod-1", sku: "WID-1", name: "Widget" };
    const db = makeDb({ product: { create: vi.fn().mockResolvedValue(created) } });

    await service.createProduct(db, "tenant-1", {
      ...baseCreateInput,
      levyIds: ["levy-1", "levy-2"],
    });

    expect(db.levy.findUnique).toHaveBeenCalledWith({ where: { id: "levy-1" } });
    expect(db.levy.findUnique).toHaveBeenCalledWith({ where: { id: "levy-2" } });
    expect(db.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productLevies: { create: [{ levyId: "levy-1" }, { levyId: "levy-2" }] },
        }),
        include: expect.objectContaining({
          productLevies: { include: { levy: true } },
        }),
      }),
    );
  });

  it("rejects a levyId that doesn't resolve under this tenant", async () => {
    const db = makeDb({ levy: { findUnique: vi.fn().mockResolvedValue(null) } });

    await expect(
      service.createProduct(db, "tenant-1", { ...baseCreateInput, levyIds: ["missing-levy"] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.product.create).not.toHaveBeenCalled();
  });
});

describe("product.service.updateProduct — tax fields + levy sync", () => {
  it("persists taxCategory/taxInclusive and never leaks levyIds into db.product.update", async () => {
    const existing = { id: "prod-1", sku: "WID-1", name: "Widget" };
    const updated = { ...existing, taxCategory: "EXEMPT", taxInclusive: true };
    const db = makeDb({
      product: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    });

    await service.updateProduct(db, "prod-1", {
      taxCategory: "EXEMPT",
      taxInclusive: true,
    });

    const args = db.product.update.mock.calls[0][0];
    expect(args.data).toMatchObject({ taxCategory: "EXEMPT", taxInclusive: true });
    expect(args.data).not.toHaveProperty("levyIds");
    expect(args.include.productLevies).toEqual({ include: { levy: true } });
  });

  it("delete-then-recreates productLevies from levyIds", async () => {
    const existing = { id: "prod-1", sku: "WID-1", name: "Widget" };
    const db = makeDb({
      product: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(existing),
      },
    });

    await service.updateProduct(db, "prod-1", { levyIds: ["levy-1"] });

    expect(db.productLevy.deleteMany).toHaveBeenCalledWith({ where: { productId: "prod-1" } });
    expect(db.productLevy.createMany).toHaveBeenCalledWith({
      data: [{ productId: "prod-1", levyId: "levy-1" }],
    });
  });

  it("clears all levies when levyIds is an empty array", async () => {
    const existing = { id: "prod-1", sku: "WID-1", name: "Widget" };
    const db = makeDb({
      product: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(existing),
      },
    });

    await service.updateProduct(db, "prod-1", { levyIds: [] });

    expect(db.productLevy.deleteMany).toHaveBeenCalledWith({ where: { productId: "prod-1" } });
    expect(db.productLevy.createMany).not.toHaveBeenCalled();
  });

  it("leaves existing levy bindings untouched when levyIds is omitted", async () => {
    const existing = { id: "prod-1", sku: "WID-1", name: "Widget" };
    const db = makeDb({
      product: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(existing),
      },
    });

    await service.updateProduct(db, "prod-1", { name: "Widget 2" });

    expect(db.productLevy.deleteMany).not.toHaveBeenCalled();
    expect(db.productLevy.createMany).not.toHaveBeenCalled();
  });

  it("rejects a levyId that doesn't resolve under this tenant", async () => {
    const existing = { id: "prod-1", sku: "WID-1", name: "Widget" };
    const db = makeDb({
      product: { findUnique: vi.fn().mockResolvedValue(existing) },
      levy: { findUnique: vi.fn().mockResolvedValue(null) },
    });

    await expect(
      service.updateProduct(db, "prod-1", { levyIds: ["missing-levy"] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.productLevy.deleteMany).not.toHaveBeenCalled();
    expect(db.product.update).not.toHaveBeenCalled();
  });

  it("de-dupes repeated levyIds before sync (avoids composite-PK P2002)", async () => {
    const existing = { id: "prod-1", sku: "WID-1", name: "Widget" };
    const db = makeDb({
      product: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(existing),
      },
    });

    await service.updateProduct(db, "prod-1", { levyIds: ["levy-1", "levy-1", "levy-2"] });

    expect(db.levy.findUnique).toHaveBeenCalledTimes(2);
    expect(db.productLevy.createMany).toHaveBeenCalledWith({
      data: [
        { productId: "prod-1", levyId: "levy-1" },
        { productId: "prod-1", levyId: "levy-2" },
      ],
    });
  });
});

// ── Fix: lookupByBarcode must carry productLevies (cashier preview == backend
// charge on the primary scan path — see product.service.ts lookupByBarcode) ──
describe("product.service.lookupByBarcode — productLevies parity with listProducts", () => {
  const levyRow = { levyId: "levy-1", levy: { id: "levy-1", name: "Env Levy", amount: 2 } };

  it("includes productLevies on the direct product-barcode match, and returns them intact", async () => {
    const matched = {
      id: "prod-1",
      productType: "STANDARD",
      variants: [],
      storeStock: false,
      productLevies: [levyRow],
    };
    const db = makeDb({ product: { findFirst: vi.fn().mockResolvedValue(matched) } });

    const result = await service.lookupByBarcode(db, "12345");

    expect(db.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          productLevies: { include: { levy: true } },
        }),
      }),
    );
    expect(result.product.productLevies).toEqual([levyRow]);
  });

  it("includes productLevies on the variant-barcode fallback match", async () => {
    const productWithLevies = {
      id: "prod-2",
      productType: "STANDARD",
      variants: [],
      storeStock: false,
      isActive: true,
      productLevies: [levyRow],
    };
    const db = makeDb({
      product: { findFirst: vi.fn().mockResolvedValue(null) },
      productVariant: {
        findFirst: vi.fn().mockResolvedValue({ id: "var-1", product: productWithLevies }),
      },
    });

    const result = await service.lookupByBarcode(db, "variant-barcode");

    expect(db.productVariant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          product: expect.objectContaining({
            include: expect.objectContaining({
              productLevies: { include: { levy: true } },
            }),
          }),
        }),
      }),
    );
    expect(result.product.productLevies).toEqual([levyRow]);
    expect(result.matchedVariantId).toBe("var-1");
  });

  it("includes productLevies on the SKU fallback match", async () => {
    const bySku = {
      id: "prod-3",
      productType: "STANDARD",
      variants: [],
      storeStock: false,
      productLevies: [levyRow],
    };
    const db = makeDb({
      product: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // 1. barcode match — miss
          .mockResolvedValueOnce(bySku), // 3. SKU fallback — hit
      },
    });

    const result = await service.lookupByBarcode(db, "WID-1");

    const skuCallArgs = db.product.findFirst.mock.calls[1][0];
    expect(skuCallArgs.include.productLevies).toEqual({ include: { levy: true } });
    expect(result.product.productLevies).toEqual([levyRow]);
  });
});

// ── Fix 3: lock the update-schema no-reset property ─────────────────────────
// Pins the deliberate design (see comment in product.validation.ts above
// `updateProductSchema`): a PATCH that omits taxCategory/taxInclusive must
// NOT reset a product's tax treatment, whereas a create always defaults it.
describe("product.validation — taxCategory/taxInclusive default vs no-reset", () => {
  it("updateProductSchema omits taxCategory/taxInclusive entirely when not supplied", () => {
    const parsed = updateProductSchema.parse({ name: "x" });

    expect("taxCategory" in parsed).toBe(false);
    expect("taxInclusive" in parsed).toBe(false);
  });

  it("createProductSchema defaults taxCategory to STANDARD and taxInclusive to false", () => {
    const parsed = createProductSchema.parse({
      name: "Widget",
      sku: "WID-1",
      costPrice: 5,
      sellPrice: 10,
    });

    expect(parsed.taxCategory).toBe("STANDARD");
    expect(parsed.taxInclusive).toBe(false);
  });
});
