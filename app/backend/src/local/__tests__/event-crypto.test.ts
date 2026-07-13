import { describe, expect, it } from "vitest";
import { deriveLocalDbKey } from "../key-derivation";
import { decryptEvent, encryptEvent } from "../event-crypto";

const key = deriveLocalDbKey("m", "d");

describe("event-crypto", () => {
  it("round-trips utf-8", () => {
    const p = JSON.stringify({ a: 1, s: "héllo" });
    expect(decryptEvent(encryptEvent(p, key), key)).toBe(p);
  });
  it("throws on tamper", () => {
    const w = encryptEvent("x", key);
    const bad = w.slice(0, -2) + (w.endsWith("A") ? "B" : "A");
    expect(() => decryptEvent(bad, key)).toThrow();
  });
  it("throws with the wrong key", () => {
    const w = encryptEvent("x", key);
    expect(() => decryptEvent(w, deriveLocalDbKey("m", "other"))).toThrow();
  });
});
