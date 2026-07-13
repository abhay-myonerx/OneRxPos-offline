import { describe, it, expect } from "vitest";
import { STATUS_QUERY, parsePrinterStatus } from "../../src/hardware/escpos-status";

describe("printer status", () => {
  it("exposes the DLE EOT query bytes", () => {
    expect(STATUS_QUERY.paper).toEqual([0x10, 0x04, 0x04]);
    expect(STATUS_QUERY.printer).toEqual([0x10, 0x04, 0x01]);
    expect(STATUS_QUERY.offline).toEqual([0x10, 0x04, 0x02]);
  });

  it("parses drawer-open, cover-open and paper-out bits", () => {
    expect(parsePrinterStatus(0x04, 0, 0).drawerOpen).toBe(true);
    expect(parsePrinterStatus(0, 0x04, 0).coverOpen).toBe(true);
    expect(parsePrinterStatus(0, 0, 0x60).paperOut).toBe(true);
  });

  it("all-clear bytes → all false", () => {
    expect(parsePrinterStatus(0, 0, 0)).toEqual({ drawerOpen: false, coverOpen: false, paperOut: false });
  });
});
