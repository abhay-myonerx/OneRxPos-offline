import { describe, it, expect } from "vitest";
import { decodeScannerInput } from "../../src/hardware/scanner-decode";

describe("decodeScannerInput", () => {
  it("detects and strips the GS1 DataMatrix ]d2 prefix", () => {
    const r = decodeScannerInput("]d2(01)00300000000001\r", "2d_gs1_datamatrix");
    expect(r.symbology).toBe("datamatrix");
    expect(r.data).toBe("(01)00300000000001");
  });

  it("strips a CR suffix for a standard HID profile", () => {
    expect(decodeScannerInput("012345678905\r", "zebra_ds2208")).toEqual({
      data: "012345678905",
      symbology: "unknown",
    });
  });

  it("strips a Tab suffix for a Tab-suffix profile", () => {
    expect(decodeScannerInput("012345\t", "datalogic_quickscan").data).toBe("012345");
  });

  it("with no profile, strips a trailing CR/LF/Tab", () => {
    expect(decodeScannerInput("012345\r\n").data).toBe("012345");
  });
});
