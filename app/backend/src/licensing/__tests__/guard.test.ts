// src/licensing/__tests__/guard.test.ts
import { describe, it, expect } from "vitest";
import { evaluateLicenseState } from "../guard";

const DAY = 86_400_000;
const T0 = 1_000_000_000_000; // fixed injected clock base
const base = { hasKey: true, lease: "L", degradeDays: 7, lockoutDays: 30 };

describe("evaluateLicenseState", () => {
  it("unlicensed when no key configured", () => {
    expect(evaluateLicenseState({ ...base, hasKey: false, lastValidatedAt: null, now: T0 }).status).toBe("unlicensed");
  });
  it("unlicensed when key set but never validated (no lease)", () => {
    expect(evaluateLicenseState({ ...base, lease: null, lastValidatedAt: null, now: T0 }).status).toBe("unlicensed");
  });
  it("active within the degrade window", () => {
    expect(evaluateLicenseState({ ...base, lastValidatedAt: T0, now: T0 + 5 * DAY }).status).toBe("active");
  });
  it("degraded after 8 offline days", () => {
    expect(evaluateLicenseState({ ...base, lastValidatedAt: T0, now: T0 + 8 * DAY }).status).toBe("degraded");
  });
  it("locked after 31 offline days", () => {
    expect(evaluateLicenseState({ ...base, lastValidatedAt: T0, now: T0 + 31 * DAY }).status).toBe("locked");
  });
  it("reports graceExpiresAt = lastValidatedAt + lockoutDays", () => {
    const r = evaluateLicenseState({ ...base, lastValidatedAt: T0, now: T0 + DAY });
    expect(r.graceExpiresAt).toBe(T0 + 30 * DAY);
  });
});
