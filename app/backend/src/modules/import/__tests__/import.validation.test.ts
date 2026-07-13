import { describe, it, expect } from "vitest";
import { importRequestSchema, productRowSchema, vendorRowSchema, MAX_IMPORT_ROWS } from "../import.validation";

describe("importRequestSchema", () => {
  it("accepts a valid dry-run request", () => {
    const r = importRequestSchema.safeParse({ mode: "PRODUCTS", rows: [{ name: "A", sku: "S1" }], dryRun: true });
    expect(r.success).toBe(true);
  });
  it("rejects an unknown mode", () => {
    expect(importRequestSchema.safeParse({ mode: "NOPE", rows: [{}] }).success).toBe(false);
  });
  it("rejects more than the row cap", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ({ name: "A", sku: "S" }));
    expect(importRequestSchema.safeParse({ mode: "PRODUCTS", rows }).success).toBe(false);
  });
});

describe("productRowSchema", () => {
  it("flags a missing name and a negative price", () => {
    expect(productRowSchema.safeParse({ sku: "S1", costPrice: 1, sellPrice: 2 }).success).toBe(false);
    expect(productRowSchema.safeParse({ name: "A", sku: "S1", costPrice: -1, sellPrice: 2 }).success).toBe(false);
  });
  it("coerces string prices", () => {
    const r = productRowSchema.safeParse({ name: "A", sku: "S1", costPrice: "1.50", sellPrice: "3" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.costPrice).toBe(1.5);
  });
});

describe("vendorRowSchema", () => {
  it("requires a SKU or barcode", () => {
    expect(vendorRowSchema.safeParse({ costPrice: 1 }).success).toBe(false);
    expect(vendorRowSchema.safeParse({ sku: "S1", costPrice: 1 }).success).toBe(true);
  });
});
