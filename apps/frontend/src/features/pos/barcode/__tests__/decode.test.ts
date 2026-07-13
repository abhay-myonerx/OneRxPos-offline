import { describe, it, expect } from "vitest";
import { decodeBarcode } from "../decode";
import type { BarcodeTemplate, DecodeContext } from "../types";

const rxTemplate: BarcodeTemplate = {
  id: "tpl-1",
  name: "Acme Rx",
  matchType: "prefix",
  matchValue: "RX",
  strategy: "delimited",
  isActive: true,
  config: {
    delimiter: "|",
    priceDecimals: 2,
    taxCategory: "ZERO_RATED",
    fields: [
      { name: "rx", kind: "rxNumber", index: 1 },
      { name: "pt", kind: "patient", index: 2 },
      { name: "amt", kind: "price", index: 3 },
    ],
  },
};

const ctx = (templates: BarcodeTemplate[] = []): DecodeContext => ({ templates });

describe("decodeBarcode routing", () => {
  it("routes a plain UPC to a product lookup", () => {
    const r = decodeBarcode("036000291452", ctx());
    expect(r).toMatchObject({ kind: "product", code: "036000291452" });
  });

  it("routes a GS1 price-embedded scan to gs1", () => {
    const r = decodeBarcode("0100012345678905" + "39221099", ctx());
    expect(r.kind).toBe("gs1");
    if (r.kind === "gs1") expect(r.price).toBeCloseTo(10.99, 5);
  });

  it("routes a learned Rx label to rx (template wins over product)", () => {
    const r = decodeBarcode("RX|12345|JANE DOE|1240", ctx([rxTemplate]));
    expect(r.kind).toBe("rx");
    if (r.kind !== "rx") return;
    expect(r.templateId).toBe("tpl-1");
    expect(r.fields.rxNumber).toBe("12345");
    expect(r.fields.patient).toBe("JANE DOE");
    expect(r.fields.price).toBeCloseTo(12.4, 5);
    expect(r.taxCategory).toBe("ZERO_RATED");
  });

  it("downgrades to unknown when a template promises a price it can't read", () => {
    const r = decodeBarcode("RX|12345|JANE DOE|", ctx([rxTemplate]));
    expect(r.kind).toBe("unknown");
  });

  it("returns unknown for an empty scan", () => {
    expect(decodeBarcode("   ", ctx()).kind).toBe("unknown");
  });

  it("falls back to a product code for an unrecognised non-empty string", () => {
    const r = decodeBarcode("WEIRD-SKU-9", ctx());
    expect(r).toMatchObject({ kind: "product", code: "WEIRD-SKU-9" });
  });
});
