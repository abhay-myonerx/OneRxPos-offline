import { describe, expect, it } from "vitest";
import { deriveLocalDbKey, keyToHex } from "../key-derivation";

describe("deriveLocalDbKey", () => {
  it("is deterministic and 32 bytes", () => {
    const a = deriveLocalDbKey("master", "device-1");
    const b = deriveLocalDbKey("master", "device-1");
    expect(a.length).toBe(32);
    expect(a.equals(b)).toBe(true);
  });
  it("differs per device id and per master", () => {
    expect(deriveLocalDbKey("m", "d1").equals(deriveLocalDbKey("m", "d2"))).toBe(false);
    expect(deriveLocalDbKey("m1", "d").equals(deriveLocalDbKey("m2", "d"))).toBe(false);
  });
  it("keyToHex is 64 hex chars", () => {
    expect(keyToHex(deriveLocalDbKey("m", "d"))).toMatch(/^[0-9a-f]{64}$/);
  });
});
