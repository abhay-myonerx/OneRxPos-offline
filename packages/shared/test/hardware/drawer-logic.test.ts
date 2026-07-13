import { describe, it, expect } from "vitest";
import { shouldKickDrawer, drawerKickBytes } from "../../src/hardware/drawer-logic";

describe("drawer tender gate", () => {
  it("kicks ONLY for cash and cheque", () => {
    expect(shouldKickDrawer("CASH")).toBe(true);
    expect(shouldKickDrawer("CHEQUE")).toBe(true);
    expect(shouldKickDrawer("cheque")).toBe(true); // case-insensitive
    expect(shouldKickDrawer("CHECK")).toBe(true);
  });

  it("NEVER kicks for card or gift tenders", () => {
    expect(shouldKickDrawer("INTERAC_DEBIT")).toBe(false);
    expect(shouldKickDrawer("VISA")).toBe(false);
    expect(shouldKickDrawer("CREDIT")).toBe(false);
    expect(shouldKickDrawer("GIFT")).toBe(false);
    expect(shouldKickDrawer("OTHER")).toBe(false);
  });
});

describe("dual-drawer kick bytes", () => {
  it("returns the Epson pin-2 and pin-5 kick bytes", () => {
    expect(drawerKickBytes(2)).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
    expect(drawerKickBytes(5)).toEqual([0x1b, 0x70, 0x01, 0x19, 0xfa]);
  });

  it("returns the Star kick bytes for a Star drawer profile", () => {
    expect(drawerKickBytes(2, "drawer_via_star")).toEqual([0x1b, 0x07, 0x0b, 0x37, 0x05]);
  });
});
