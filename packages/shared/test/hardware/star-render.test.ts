import { describe, it, expect } from "vitest";
import { renderStarReceipt } from "../../src/hardware/star-render";

const bytes = (j: Parameters<typeof renderStarReceipt>[0]) => Array.from(renderStarReceipt(j));

describe("renderStarReceipt (Star Line Mode)", () => {
  it("starts with ESC @ init", () => {
    expect(bytes({ lines: [] }).slice(0, 2)).toEqual([0x1b, 0x40]);
  });

  it("uses Star alignment (ESC GS a) + emphasis (ESC E/F), not ESC/POS", () => {
    const b = bytes({ lines: [{ text: "Hi", align: "center", bold: true }] });
    // ESC @ , ESC GS a 1 , ESC E , 'H' 'i' , LF , ESC F
    expect(b).toEqual([0x1b, 0x40, 0x1b, 0x1d, 0x61, 0x01, 0x1b, 0x45, 0x48, 0x69, 0x0a, 0x1b, 0x46]);
  });

  it("cuts with ESC d 2 (differs from Epson GS V 0)", () => {
    expect(bytes({ lines: [], cut: true }).slice(-3)).toEqual([0x1b, 0x64, 0x02]);
  });

  it("kicks the drawer with ESC BEL (differs from Epson ESC p)", () => {
    expect(bytes({ lines: [], openDrawer: true }).slice(-5)).toEqual([0x1b, 0x07, 0x0b, 0x37, 0x05]);
  });
});
