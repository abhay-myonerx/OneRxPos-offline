import { describe, it, expect } from "vitest";
import { gs1Adapter, parseGs1 } from "../gs1.adapter";
import type { DecodeContext } from "../../types";

const ctx: DecodeContext = { templates: [] };
const GS = "\x1d";
const GTIN = "00012345678905";

describe("parseGs1", () => {
  it("parses GTIN + net weight + price (no separators, AI-length segmentation)", () => {
    const ais = parseGs1(`01${GTIN}3103001250` + `39221099`);
    expect(ais["01"]).toBe(GTIN);
    expect(ais["3103"]).toBe("001250");
    expect(ais["3922"]).toBe("1099");
  });

  it("honours a GS separator terminating a variable-length AI", () => {
    const ais = parseGs1(`10LOT9${GS}17251231`);
    expect(ais["10"]).toBe("LOT9");
    expect(ais["17"]).toBe("251231");
  });
});

describe("gs1Adapter.decode", () => {
  it("extracts gtin, embedded price (implied decimals), and weight (kg)", () => {
    const r = gs1Adapter.decode(`01${GTIN}3103001250` + `39221099`, ctx);
    expect(r.kind).toBe("gs1");
    if (r.kind !== "gs1") return;
    expect(r.gtin).toBe(GTIN);
    expect(r.weightKg).toBeCloseTo(1.25, 5);
    expect(r.price).toBeCloseTo(10.99, 5);
  });

  it("extracts batch + expiry", () => {
    const r = gs1Adapter.decode(`01${GTIN}17251231` + `10ABC123`, ctx);
    if (r.kind !== "gs1") throw new Error("expected gs1");
    expect(r.expiry).toBe("251231");
    expect(r.batch).toBe("ABC123");
  });

  it("strips ISO currency from a 393n price", () => {
    // 3932 = price w/ currency, 2 decimals; value = "124" (currency 124) + "0500" → 5.00
    const r = gs1Adapter.decode(`01${GTIN}` + `39321240500`, ctx);
    if (r.kind !== "gs1") throw new Error("expected gs1");
    expect(r.price).toBeCloseTo(5.0, 5);
  });
});

describe("gs1Adapter.match", () => {
  it("is confident for a GS1 symbology or a GTIN-led string", () => {
    expect(gs1Adapter.match("anything", { templates: [], symbology: "]C1" })).toBe(0.9);
    expect(gs1Adapter.match(`01${GTIN}`, ctx)).toBe(0.85);
  });
  it("does not claim a plain UPC/EAN", () => {
    expect(gs1Adapter.match("036000291452", ctx)).toBe(0);
    expect(gs1Adapter.match("4006381333931", ctx)).toBe(0);
  });
});
