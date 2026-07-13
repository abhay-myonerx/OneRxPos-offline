// Phase 2.4 — unit tests for the narcotic-product resolution helpers
// (`listNarcoticProducts`, `assertNarcotic`, `getOnHand`) against a tiny
// in-memory client. Verifies the narcotic-only effective-schedule filter and
// the write-guard directly, without the HTTP layer.

import { describe, it, expect } from "vitest";
import {
  assertNarcotic,
  getOnHand,
  listNarcoticProducts,
} from "../narcotic-products";
import { ValidationError } from "../../../shared/errors/ValidationError";
import type { TenantPrismaClient } from "../../../config/database";

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  din: string | null;
  scheduleOverride: string | null;
  isActive: boolean;
}
interface DrugRow {
  din: string;
  scheduleCategory: string;
}
interface StockRow {
  storeId: string;
  productId: string;
  quantity: number;
}

function fakeDb(seed: { products: ProductRow[]; drugs: DrugRow[]; stock: StockRow[] }) {
  return {
    product: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        seed.products
          .filter((p) => (where.isActive === undefined ? true : p.isActive === where.isActive))
          .filter((p) => (p.din !== null || p.scheduleOverride !== null))
          .map((p) => ({ ...p })),
      findUnique: async ({ where }: { where: { id: string } }) =>
        seed.products.find((p) => p.id === where.id) ?? null,
    },
    drugProduct: {
      findMany: async ({ where }: { where: { din: { in: string[] } } }) =>
        seed.drugs.filter((d) => where.din.in.includes(d.din)).map((d) => ({ ...d })),
      findUnique: async ({ where }: { where: { din: string } }) =>
        seed.drugs.find((d) => d.din === where.din) ?? null,
    },
    storeStock: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        seed.stock
          .filter((s) => (where.storeId === undefined ? true : s.storeId === where.storeId))
          .filter((s) => {
            const pid = where.productId as { in?: string[] } | string | undefined;
            if (pid === undefined) return true;
            if (typeof pid === "object" && Array.isArray(pid.in)) return pid.in.includes(s.productId);
            return s.productId === pid;
          })
          .map((s) => ({ ...s })),
    },
  } as unknown as TenantPrismaClient;
}

const SEED = {
  products: [
    { id: "p-narc", name: "Codeine", sku: "COD", din: "111", scheduleOverride: null, isActive: true },
    { id: "p-rx", name: "Statin", sku: "STA", din: "222", scheduleOverride: null, isActive: true },
    { id: "p-otc", name: "Advil", sku: "ADV", din: null, scheduleOverride: null, isActive: true },
    { id: "p-override", name: "Custom", sku: "CUS", din: null, scheduleOverride: "NARCOTIC", isActive: true },
  ] as ProductRow[],
  drugs: [
    { din: "111", scheduleCategory: "NARCOTIC" },
    { din: "222", scheduleCategory: "NEEDS_RX" },
  ] as DrugRow[],
  stock: [
    { storeId: "s1", productId: "p-narc", quantity: 40 },
    { storeId: "s1", productId: "p-narc", quantity: 10 }, // second row → summed
    { storeId: "s1", productId: "p-override", quantity: 7 },
    { storeId: "s1", productId: "p-rx", quantity: 99 },
  ] as StockRow[],
};

describe("listNarcoticProducts", () => {
  it("returns only NARCOTIC-scheduled products (catalog + override), summing on-hand", async () => {
    const db = fakeDb(SEED);
    const list = await listNarcoticProducts(db, "s1");
    const ids = list.map((p) => p.productId).sort();
    expect(ids).toEqual(["p-narc", "p-override"]);

    const narc = list.find((p) => p.productId === "p-narc")!;
    expect(narc.onHand).toBe(50); // 40 + 10
    const override = list.find((p) => p.productId === "p-override")!;
    expect(override.onHand).toBe(7);
  });

  it("excludes NEEDS_RX and OTC products", async () => {
    const db = fakeDb(SEED);
    const list = await listNarcoticProducts(db, "s1");
    expect(list.some((p) => p.productId === "p-rx")).toBe(false);
    expect(list.some((p) => p.productId === "p-otc")).toBe(false);
  });
});

describe("getOnHand", () => {
  it("sums store_stock rows for a store/product", async () => {
    const db = fakeDb(SEED);
    expect(await getOnHand(db, "s1", "p-narc")).toBe(50);
  });
});

describe("assertNarcotic", () => {
  it("resolves through for a narcotic product", async () => {
    const db = fakeDb(SEED);
    await expect(assertNarcotic(db, "p-narc")).resolves.toBeUndefined();
    await expect(assertNarcotic(db, "p-override")).resolves.toBeUndefined();
  });

  it("throws ValidationError for a non-narcotic product", async () => {
    const db = fakeDb(SEED);
    await expect(assertNarcotic(db, "p-rx")).rejects.toBeInstanceOf(ValidationError);
    await expect(assertNarcotic(db, "p-otc")).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws for an unknown product (fail-closed)", async () => {
    const db = fakeDb(SEED);
    await expect(assertNarcotic(db, "nope")).rejects.toBeInstanceOf(ValidationError);
  });
});
