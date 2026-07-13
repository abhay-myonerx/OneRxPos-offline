import { describe, it, expect } from "vitest";
import { autoMapHeaders, applyMapping, targetFields } from "../auto-map";
import { parseSpreadsheet } from "../parse-spreadsheet";

describe("autoMapHeaders", () => {
  it("maps common product headers by synonym", () => {
    const m = autoMapHeaders(["Product Name", "SKU", "Cost", "Barcode", "Retail Price"], "PRODUCTS");
    expect(m["Product Name"]).toBe("name");
    expect(m["SKU"]).toBe("sku");
    expect(m["Cost"]).toBe("costPrice");
    expect(m["Barcode"]).toBe("barcode");
    expect(m["Retail Price"]).toBe("sellPrice");
  });
  it("leaves unknown headers unmapped", () => {
    const m = autoMapHeaders(["Weird Column"], "PRODUCTS");
    expect(m["Weird Column"]).toBe("");
  });
  it("maps vendor headers", () => {
    const m = autoMapHeaders(["SKU", "Unit Cost", "Vendor SKU", "MOQ"], "VENDOR_PRICELIST");
    expect(m["SKU"]).toBe("sku");
    expect(m["Unit Cost"]).toBe("costPrice");
    expect(m["Vendor SKU"]).toBe("supplierSku");
    expect(m["MOQ"]).toBe("minOrderQty");
  });
  it("exposes the target fields per mode", () => {
    expect(targetFields("PRODUCTS")).toContain("name");
    expect(targetFields("VENDOR_PRICELIST")).toContain("costPrice");
  });
});

describe("applyMapping", () => {
  it("re-keys rows to target fields, dropping ignored columns", () => {
    const out = applyMapping([{ "Product Name": "Aspirin", "SKU": "ASP", "Notes": "x" }], {
      "Product Name": "name",
      "SKU": "sku",
      "Notes": "",
    });
    expect(out[0]).toEqual({ name: "Aspirin", sku: "ASP" });
  });
});

describe("parseSpreadsheet (CSV via SheetJS)", () => {
  it("parses a CSV buffer into headers + rows", async () => {
    const csv = "Name,SKU,Cost\nAspirin,ASP,1.50\nBandage,BND,0.80\n";
    const buf = new TextEncoder().encode(csv).buffer;
    const { headers, rows } = await parseSpreadsheet(buf);
    expect(headers).toEqual(["Name", "SKU", "Cost"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ Name: "Aspirin", SKU: "ASP", Cost: "1.50" });
  });
});
