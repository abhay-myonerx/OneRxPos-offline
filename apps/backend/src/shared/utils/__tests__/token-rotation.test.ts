import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { rotationKeys, verifyWithRotation } from "../token-rotation";

const K1 = "current-key-".padEnd(40, "a");
const K2 = "previous-key-".padEnd(40, "b");
const BOGUS = "bogus-key-".padEnd(40, "z");

describe("rotationKeys", () => {
  it("returns [current] with no previous", () => {
    expect(rotationKeys(K1)).toEqual([K1]);
  });
  it("returns [current, previous] when previous present", () => {
    expect(rotationKeys(K1, K2)).toEqual([K1, K2]);
  });
});

describe("verifyWithRotation", () => {
  it("verifies a token signed with the current (first) key", () => {
    const t = jwt.sign({ a: 1 }, K1);
    expect(verifyWithRotation<{ a: number }>(t, [K1, K2]).a).toBe(1);
  });
  it("verifies a token signed with the previous (second) key", () => {
    const t = jwt.sign({ a: 2 }, K2);
    expect(verifyWithRotation<{ a: number }>(t, [K1, K2]).a).toBe(2);
  });
  it("rejects a token signed with an unknown key", () => {
    const t = jwt.sign({ a: 3 }, BOGUS);
    expect(() => verifyWithRotation(t, [K1, K2])).toThrow();
  });
  it("surfaces expiry for a current-key token that is expired (not masked)", () => {
    const t = jwt.sign({ a: 4 }, K1, { expiresIn: -10 });
    expect(() => verifyWithRotation(t, [K1, K2])).toThrow(jwt.TokenExpiredError);
  });
  it("surfaces expiry even when the match is the previous key", () => {
    const t = jwt.sign({ a: 5 }, K2, { expiresIn: -10 });
    expect(() => verifyWithRotation(t, [K1, K2])).toThrow(jwt.TokenExpiredError);
  });
});
