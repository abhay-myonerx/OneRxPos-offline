import { describe, it, expect } from "vitest";
import { evaluateLockout, nextFailure } from "../lockout";
const MIN = 60_000, T0 = 1_000_000_000_000, MS = 15 * MIN, MAX = 5;
describe("lockout", () => {
  it("not locked below threshold / when lock expired", () => {
    expect(evaluateLockout({ attempts: 2, lockedUntil: null }, T0, MAX, MS).locked).toBe(false);
    expect(evaluateLockout({ attempts: 5, lockedUntil: T0 - 1 }, T0, MAX, MS).locked).toBe(false); // expired
  });
  it("locked while lockedUntil is in the future", () => {
    expect(evaluateLockout({ attempts: 5, lockedUntil: T0 + MS }, T0, MAX, MS).locked).toBe(true);
  });
  it("nextFailure increments and sets lock at the threshold", () => {
    expect(nextFailure({ attempts: 3, lockedUntil: null }, T0, MAX, MS)).toEqual({ attempts: 4, lockedUntil: null });
    expect(nextFailure({ attempts: 4, lockedUntil: null }, T0, MAX, MS)).toEqual({ attempts: 5, lockedUntil: T0 + MS });
  });
});
