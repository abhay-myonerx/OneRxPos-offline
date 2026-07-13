import { describe, it, expect } from "vitest";
import { assertPinAcceptable } from "../pin.service";

describe("pin set validation", () => {
  it("rejects weak / non-6-digit PINs", () => {
    expect(() => assertPinAcceptable("123456")).toThrow();
    expect(() => assertPinAcceptable("12ab56")).toThrow();
    expect(() => assertPinAcceptable("428193")).not.toThrow();
  });
});
