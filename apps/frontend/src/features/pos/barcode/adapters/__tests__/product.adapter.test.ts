import { describe, it, expect } from "vitest";
import { productAdapter, gtinChecksumValid, expandUpcE } from "../product.adapter";
import type { DecodeContext } from "../../types";

const ctx: DecodeContext = { templates: [] };

describe("gtinChecksumValid", () => {
  it("accepts valid EAN-13 / UPC-A / EAN-8", () => {
    expect(gtinChecksumValid("4006381333931")).toBe(true); // EAN-13
    expect(gtinChecksumValid("036000291452")).toBe(true); // UPC-A
    expect(gtinChecksumValid("73513537")).toBe(true); // EAN-8
  });
  it("rejects a bad check digit and non-digits", () => {
    expect(gtinChecksumValid("4006381333930")).toBe(false);
    expect(gtinChecksumValid("40063813339AB")).toBe(false);
  });
});

describe("expandUpcE", () => {
  it("expands an 8-digit UPC-E to a valid 12-digit UPC-A", () => {
    const upca = expandUpcE("01253005");
    expect(upca).toBe("012000005305");
    expect(upca && upca.length).toBe(12);
    expect(gtinChecksumValid(upca as string)).toBe(true); // independent check
  });
  it("returns null for non-UPC-E input", () => {
    expect(expandUpcE("123")).toBeNull();
    expect(expandUpcE("4006381333931")).toBeNull();
  });
});

describe("productAdapter", () => {
  it("matches a valid retail code with high confidence, other strings weakly", () => {
    expect(productAdapter.match("036000291452", ctx)).toBe(0.6);
    expect(productAdapter.match("SOME-SKU-XYZ", ctx)).toBe(0.2);
    expect(productAdapter.match("   ", ctx)).toBe(0);
  });

  it("decodes to a product code, normalising UPC-E to UPC-A", () => {
    const r = productAdapter.decode("01253005", ctx);
    expect(r).toMatchObject({ kind: "product", code: "012000005305", source: "product" });
  });

  it("passes a non-retail code through unchanged", () => {
    const r = productAdapter.decode("ACME-42", ctx);
    expect(r).toMatchObject({ kind: "product", code: "ACME-42" });
  });
});
