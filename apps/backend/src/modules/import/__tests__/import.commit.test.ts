import { describe, it, expect, vi } from "vitest";
import { planImport, commitImport } from "../import.service";

function makeDb(over: any = {}) {
  const tx = {
    product: { create: vi.fn(async () => ({ id: "new" })), update: vi.fn(async () => ({})) },
    category: { create: vi.fn(async ({ data }: any) => ({ id: "cat-new", ...data })) },
    brand: { create: vi.fn(async () => ({ id: "brand-new" })) },
    productSupplier: { upsert: vi.fn(async () => ({})) },
  };
  const db: any = {
    _tx: tx,
    category: { findMany: vi.fn(async () => over.categories ?? []) },
    brand: { findMany: vi.fn(async () => []) },
    product: { findMany: vi.fn(async () => over.products ?? []) },
    productSupplier: { findMany: vi.fn(async () => over.vendorLinks ?? []) },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  };
  return db;
}

describe("planImport", () => {
  it("returns per-row actions + a correct summary (no writes)", async () => {
    const db = makeDb({ products: [{ id: "p1", sku: "EXIST", barcode: null }] });
    const result = await planImport(db, "t1", {
      mode: "PRODUCTS",
      rows: [
        { name: "New", sku: "NEW1", costPrice: "1", sellPrice: "2" },
        { name: "Exists", sku: "EXIST", costPrice: "1", sellPrice: "2" },
        { sku: "BAD", costPrice: "1", sellPrice: "2" }, // missing name
      ],
    });
    expect(result.summary).toEqual({ create: 1, update: 0, skip: 1, error: 1 });
    expect(db._tx.product.create).not.toHaveBeenCalled();
  });
});

describe("commitImport — PRODUCTS", () => {
  it("creates new + updates matched per the plan", async () => {
    const db = makeDb({ products: [{ id: "p1", sku: "EXIST", barcode: null }] });
    const result = await commitImport(db, "t1", {
      mode: "PRODUCTS",
      options: { updateExisting: true },
      rows: [
        { name: "New", sku: "NEW1", costPrice: "1", sellPrice: "2" },
        { name: "Exists", sku: "EXIST", costPrice: "5", sellPrice: "9" },
      ],
    });
    expect(result.committed).toBe(true);
    expect(db._tx.product.create).toHaveBeenCalledTimes(1);
    expect(db._tx.product.update).toHaveBeenCalledTimes(1);
  });

  it("auto-creates a missing category when enabled", async () => {
    const db = makeDb();
    await commitImport(db, "t1", {
      mode: "PRODUCTS",
      options: { createMissingCategories: true },
      rows: [{ name: "A", sku: "S1", category: "Vitamins", costPrice: "1", sellPrice: "2" }],
    });
    expect(db._tx.category.create).toHaveBeenCalledTimes(1);
    expect(db._tx.product.create).toHaveBeenCalledTimes(1);
  });

  it("onError:abort writes nothing when any row errors", async () => {
    const db = makeDb();
    const result = await commitImport(db, "t1", {
      mode: "PRODUCTS",
      options: { onError: "abort" },
      rows: [
        { name: "Good", sku: "S1", costPrice: "1", sellPrice: "2" },
        { sku: "BAD", costPrice: "1", sellPrice: "2" }, // error
      ],
    });
    expect(result.committed).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("commitImport — VENDOR_PRICELIST", () => {
  it("upserts ProductSupplier for matched products", async () => {
    const db = makeDb({ products: [{ id: "p1", sku: "ASP", barcode: null }] });
    const result = await commitImport(db, "t1", {
      mode: "VENDOR_PRICELIST",
      options: { supplierId: "s1" },
      rows: [{ sku: "ASP", costPrice: "1.5", supplierSku: "V-ASP" }],
    });
    expect(result.summary.create).toBe(1);
    expect(db._tx.productSupplier.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId_supplierId: { productId: "p1", supplierId: "s1" } } }),
    );
  });
});
