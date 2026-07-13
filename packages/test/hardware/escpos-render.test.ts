import { describe, it, expect } from "vitest";
import { renderReceipt } from "../../src/hardware/escpos-render";
import type { ReceiptJob } from "../../src/hardware/hal.types";

const bytes = (j: ReceiptJob) => Array.from(renderReceipt(j));

describe("renderReceipt", () => {
  it("starts with ESC @ init", () => {
    expect(bytes({ lines: [] }).slice(0, 2)).toEqual([0x1b, 0x40]);
  });

  it("renders a centered bold line with alignment + emphasis framing", () => {
    const b = bytes({ lines: [{ text: "Hi", align: "center", bold: true }] });
    // ESC @ , ESC a 1 , ESC E 1 , 'H' 'i' , LF , ESC E 0
    expect(b).toEqual([
      0x1b, 0x40, 0x1b, 0x61, 0x01, 0x1b, 0x45, 0x01, 0x48, 0x69, 0x0a, 0x1b,
      0x45, 0x00,
    ]);
  });

  it("defaults alignment to left (ESC a 0) with no emphasis", () => {
    const b = bytes({ lines: [{ text: "A" }] });
    expect(b).toEqual([0x1b, 0x40, 0x1b, 0x61, 0x00, 0x41, 0x0a]);
  });

  it("emits CODE39 barcode framing (GS k 4 ... NUL)", () => {
    const b = bytes({ lines: [], barcode: "INV-4" });
    const idx = b.indexOf(0x1d);
    expect(b.slice(idx, idx + 3)).toEqual([0x1d, 0x6b, 0x04]);
    expect(b[b.length - 1]).toBe(0x00);
  });

  it("emits a drawer kick when openDrawer is set", () => {
    const b = bytes({ lines: [], openDrawer: true });
    expect(b.slice(-5)).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });

  it("emits a full cut when cut is set", () => {
    const b = bytes({ lines: [], cut: true });
    expect(b.slice(-3)).toEqual([0x1d, 0x56, 0x00]);
  });

  it("replaces non-ASCII characters with '?'", () => {
    const b = bytes({ lines: [{ text: "café" }] });
    expect(b).toContain(0x3f);
  });

  it("returns a Uint8Array", () => {
    expect(renderReceipt({ lines: [] })).toBeInstanceOf(Uint8Array);
  });

  it("emits the QR model-2 select and print sequence when qr is set", () => {
    const b = bytes({ lines: [], qr: "INV-4" });
    const joined = b.join(",");
    // model 2 select: GS ( k 04 00 31 41 32 00
    expect(joined).toContain([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00].join(","));
    // print: GS ( k 03 00 31 51 30
    expect(joined).toContain([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30].join(","));
  });

  it("QR store-data length byte accounts for data length + 3", () => {
    const b = bytes({ lines: [], qr: "AB" }); // pL = 2 + 3 = 5
    // store data: GS ( k 05 00 31 50 30 'A' 'B'
    const seq = [0x1d, 0x28, 0x6b, 0x05, 0x00, 0x31, 0x50, 0x30, 0x41, 0x42];
    expect(b.join(",")).toContain(seq.join(","));
  });

  it("selects the code page and encodes French accents when codepage is cp858", () => {
    const b = Array.from(renderReceipt({ lines: [{ text: "café" }] }, { codepage: "cp858" }));
    // ESC t 19 (0x1b 0x74 0x13) selects CP858
    expect(b.join(",")).toContain([0x1b, 0x74, 0x13].join(","));
    expect(b).toContain(0x82); // é in CP850/858
    expect(b).not.toContain(0x3f); // NOT '?'
  });

  it("maps Ç and à under cp850", () => {
    const b = Array.from(renderReceipt({ lines: [{ text: "Çà" }] }, { codepage: "cp850" }));
    expect(b).toContain(0x80); // Ç
    expect(b).toContain(0x85); // à
  });

  it("without a codepage, non-ASCII still falls back to '?' (unchanged)", () => {
    expect(Array.from(renderReceipt({ lines: [{ text: "café" }] }))).toContain(0x3f);
  });

  it("emits a raster logo (GS v 0) before the lines", () => {
    const b = Array.from(renderReceipt({ lines: [], logo: { width: 1, height: 1, data: [0xff] } }));
    expect(b.join(",")).toContain([0x1d, 0x76, 0x30, 0x00, 0x01, 0x00, 0x01, 0x00, 0xff].join(","));
  });
});
