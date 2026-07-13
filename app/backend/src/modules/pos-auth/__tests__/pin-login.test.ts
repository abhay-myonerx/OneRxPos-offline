// Unit tests for `runPinLogin` — the pure orchestration behind PIN
// quick-login. All dependencies are injected (no DB) so this test can
// pin down the SECURITY-CRITICAL decision flow in isolation:
//
//   tenant is resolved from the globally-unique `userId` FIRST, and the
//   device enrollment lookup is by the COMPOUND (tenantId, fingerprint)
//   — never fingerprint alone (see the note in `pin.service.ts`).

import { describe, it, expect, vi } from "vitest";

import { PinLockedError } from "@/shared/errors";
import { runPinLogin, type PinLoginDeps } from "../pin.service";

const base = (over: Partial<PinLoginDeps>): PinLoginDeps => ({
  now: 1_000_000_000_000,
  maxAttempts: 5,
  lockoutMs: 900_000,
  getUser: async () => ({ tenantId: "t1", storeId: "s1", isActive: true, tenantStatus: "ACTIVE" }),
  getEnrollment: async () => ({ tenantId: "t1", storeId: "s1" }),
  getPinHash: async () => "hash",
  verify: async () => true,
  getLockout: async () => ({ attempts: 0, lockedUntil: null }),
  saveLockout: vi.fn(async () => {}),
  audit: vi.fn(async () => {}),
  issue: async () => ({ accessToken: "a", refreshToken: "r" }),
  ...over,
});

describe("runPinLogin", () => {
  it("resolves the user's tenant then issues tokens on a correct PIN from an enrolled device", async () => {
    const getEnrollment = vi.fn(async (tenantId: string, _fp: string) => ({ tenantId, storeId: "s1" }));
    const d = base({ getEnrollment });

    expect(await runPinLogin({ deviceFingerprint: "f", userId: "u1", pin: "428193" }, d)).toEqual({
      accessToken: "a",
      refreshToken: "r",
    });
    // device lookup MUST be by the compound (tenantId, fingerprint), tenant coming from the user — never fingerprint alone
    expect(getEnrollment).toHaveBeenCalledWith("t1", "f");
  });

  it("refuses an unknown or inactive user with the generic error (no enumeration)", async () => {
    await expect(
      runPinLogin({ deviceFingerprint: "f", userId: "u1", pin: "x" }, base({ getUser: async () => null })),
    ).rejects.toThrow();
    await expect(
      runPinLogin(
        { deviceFingerprint: "f", userId: "u1", pin: "x" },
        base({ getUser: async () => ({ tenantId: "t1", storeId: "s1", isActive: false, tenantStatus: "ACTIVE" }) }),
      ),
    ).rejects.toThrow();
  });

  it("refuses a user whose tenant is SUSPENDED — no tokens issued (auth-gate bypass)", async () => {
    const issue = vi.fn(async () => ({ accessToken: "a", refreshToken: "r" }));
    await expect(
      runPinLogin(
        { deviceFingerprint: "f", userId: "u1", pin: "428193" },
        base({
          getUser: async () => ({ tenantId: "t1", storeId: "s1", isActive: true, tenantStatus: "SUSPENDED" }),
          issue,
        }),
      ),
    ).rejects.toThrow();
    expect(issue).not.toHaveBeenCalled();
  });

  it("refuses a device not enrolled for THIS user's tenant", async () => {
    await expect(
      runPinLogin({ deviceFingerprint: "f", userId: "u1", pin: "x" }, base({ getEnrollment: async () => null })),
    ).rejects.toThrow(/enroll/i);
  });

  it("locks after max attempts on wrong PIN", async () => {
    const save = vi.fn(async () => {});
    await expect(
      runPinLogin(
        { deviceFingerprint: "f", userId: "u1", pin: "0" },
        base({ verify: async () => false, getLockout: async () => ({ attempts: 4, lockedUntil: null }), saveLockout: save }),
      ),
    ).rejects.toThrow();
    expect(save).toHaveBeenCalledWith("u1", "f", expect.objectContaining({ attempts: 5, lockedUntil: expect.any(Number) }));
  });

  it("refuses when already locked with a distinct PinLockedError (423 / PIN_LOCKED), not a generic AuthenticationError", async () => {
    const attempt = runPinLogin(
      { deviceFingerprint: "f", userId: "u1", pin: "428193" },
      base({ getLockout: async () => ({ attempts: 5, lockedUntil: 1_000_000_900_000 }) }),
    );

    await expect(attempt).rejects.toThrow(PinLockedError);
    await expect(attempt).rejects.toMatchObject({ statusCode: 423, code: "PIN_LOCKED" });
  });
});
