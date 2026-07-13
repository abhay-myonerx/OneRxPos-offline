import { describe, it, expect } from "vitest";
import { renderRxLabelZpl } from "../../src/hardware/zpl-render";

describe("renderRxLabelZpl", () => {
  it("wraps the label in ^XA … ^XZ", () => {
    const z = renderRxLabelZpl({ drugName: "Amoxil" });
    expect(z.startsWith("^XA")).toBe(true);
    expect(z.trim().endsWith("^XZ")).toBe(true);
  });

  it("renders drug name, DIN, Rx#, directions and warnings as fields", () => {
    const z = renderRxLabelZpl({
      drugName: "Amoxil 500mg",
      din: "02238233",
      rxNumber: "RX-100",
      directions: "Take 1 capsule daily",
      warnings: ["May cause drowsiness"],
    });
    expect(z).toContain("^FDAmoxil 500mg^FS");
    expect(z).toContain("DIN: 02238233");
    expect(z).toContain("Rx: RX-100");
    expect(z).toContain("Take 1 capsule daily");
    expect(z).toContain("May cause drowsiness");
  });

  it("emits a Code128 barcode field when a barcode is given", () => {
    const z = renderRxLabelZpl({ drugName: "X", barcode: "02238233" });
    expect(z).toContain("^BCN");
    expect(z).toContain("^FD02238233^FS");
  });

  it("neutralizes ZPL control characters in field data", () => {
    const z = renderRxLabelZpl({ drugName: "Bad^Name~here" });
    expect(z).not.toContain("Bad^Name");
    expect(z).toContain("Bad Name here");
  });
});
