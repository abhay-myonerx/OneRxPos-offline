import { describe, it, expect } from "vitest";
import { hashPin, verifyPin, isWeakPin } from "../pin-hash";
describe("pin-hash", () => {
  it("round-trips a PIN", async () => {
    const h = await hashPin("428193");
    expect(await verifyPin("428193", h)).toBe(true);
    expect(await verifyPin("000000", h)).toBe(false);
  });
  it("flags weak PINs", () => {
    for (const w of ["000000", "111111", "123456", "654321"]) expect(isWeakPin(w)).toBe(true);
    expect(isWeakPin("428193")).toBe(false);
  });
});
