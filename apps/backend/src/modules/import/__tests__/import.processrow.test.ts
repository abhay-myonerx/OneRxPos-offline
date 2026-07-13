import { describe, it, expect } from "vitest";
import { processRow, type RefCtx } from "../import.service";

function ctx(over: Partial<RefCtx> = {}): RefCtx {
  return {
    categoriesByName: new Map([["painkillers", "cat-1"]]),
    brandsByName: new Map(),
    productBySku: new Map(),
    productByBarcode: new Map(),
    vendorLinks: new Set(),
    ...over,
  };
}

describe("processRow — PRODUCTS", () => {
  it("classifies a new valid row as create", () => {
    const r = processRow(ctx(), { name: "Aspirin", sku: "ASP", costPrice: "1", sellPrice: "3" }, "PRODUCTS", {}, new Set());
    expect(r.action).toBe("create");
    expect((r.data as any).sku).toBe("ASP");
  });
  it("skips an existing SKU without updateExisting; updates with it", () => {
    const c = ctx({ productBySku: new Map([["asp", { id: "p1" }]]) });
    expect(processRow(c, { name: "A", sku: "ASP", costPrice: "1", sellPrice: "3" }, "PRODUCTS", {}, new Set()).action).toBe("skip");
    const u = processRow(c, { name: "A", sku: "ASP", costPrice: "1", sellPrice: "3" }, "PRODUCTS", { updateExisting: true }, new Set());
    expect(u.action).toBe("update");
    expect((u.data as any).id).toBe("p1");
  });
  it("errors on missing name / negative price", () => {
    expect(processRow(ctx(), { sku: "X", costPrice: "1", sellPrice: "3" }, "PRODUCTS", {}, new Set()).action).toBe("error");
    expect(processRow(ctx(), { name: "A", sku: "X", costPrice: "-1", sellPrice: "3" }, "PRODUCTS", {}, new Set()).action).toBe("error");
  });
  it("resolves category by name; unknown → error unless auto-create", () => {
    const ok = processRow(ctx(), { name: "A", sku: "X", category: "Painkillers", costPrice: "1", sellPrice: "3" }, "PRODUCTS", {}, new Set());
    expect((ok.data as any).categoryId).toBe("cat-1");
    const bad = processRow(ctx(), { name: "A", sku: "Y", category: "Vitamins", costPrice: "1", sellPrice: "3" }, "PRODUCTS", {}, new Set());
    expect(bad.action).toBe("error");
    const auto = processRow(ctx(), { name: "A", sku: "Z", category: "Vitamins", costPrice: "1", sellPrice: "3" }, "PRODUCTS", { createMissingCategories: true }, new Set());
    expect(auto.action).toBe("create");
    expect((auto.data as any).newCategoryName).toBe("Vitamins");
  });
  it("flags an in-file duplicate SKU", () => {
    const seen = new Set<string>();
    expect(processRow(ctx(), { name: "A", sku: "DUP", costPrice: "1", sellPrice: "3" }, "PRODUCTS", {}, seen).action).toBe("create");
    expect(processRow(ctx(), { name: "B", sku: "DUP", costPrice: "1", sellPrice: "3" }, "PRODUCTS", {}, seen).action).toBe("error");
  });
});

describe("processRow — VENDOR_PRICELIST", () => {
  const c = ctx({ productBySku: new Map([["asp", { id: "p1" }]]) });
  it("errors without a supplierId", () => {
    expect(processRow(c, { sku: "ASP", costPrice: "1" }, "VENDOR_PRICELIST", {}, new Set()).action).toBe("error");
  });
  it("matches a product by SKU → create", () => {
    const r = processRow(c, { sku: "ASP", costPrice: "1.5" }, "VENDOR_PRICELIST", { supplierId: "s1" }, new Set());
    expect(r.action).toBe("create");
    expect((r.data as any).productId).toBe("p1");
    expect((r.data as any).supplierId).toBe("s1");
  });
  it("unmatched product → error", () => {
    expect(processRow(c, { sku: "NOPE", costPrice: "1" }, "VENDOR_PRICELIST", { supplierId: "s1" }, new Set()).action).toBe("error");
  });
  it("existing vendor link → skip / update", () => {
    const cl = ctx({ productBySku: new Map([["asp", { id: "p1" }]]), vendorLinks: new Set(["p1"]) });
    expect(processRow(cl, { sku: "ASP", costPrice: "1" }, "VENDOR_PRICELIST", { supplierId: "s1" }, new Set()).action).toBe("skip");
    expect(processRow(cl, { sku: "ASP", costPrice: "1" }, "VENDOR_PRICELIST", { supplierId: "s1", updateExisting: true }, new Set()).action).toBe("update");
  });
});
