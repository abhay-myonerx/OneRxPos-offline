// Unit tests for `runRequestOverride`/`consumeOverride` — the pure
// orchestration behind the inline-PIN manager override (Phase 1.1 Task 9).
// All dependencies are injected (no DB) so this test can pin down the
// decision flow in isolation: enrollment check -> lockout check ->
// authorizer PIN -> the authorizer's OWN permission for the gated action
// -> mint a single-use, action+context-bound grant.

import { describe, it, expect, vi } from "vitest";

import { runRequestOverride, consumeOverride, type OverrideDeps } from "../override.service";
import { AuthenticationError, AuthorizationError, PinLockedError } from "@/shared/errors";

const deps = (over: Partial<OverrideDeps>): OverrideDeps => ({
  now: 1_000_000_000_000,
  maxAttempts: 5,
  lockoutMs: 900_000,
  getEnrollment: async () => ({ tenantId: "t1", storeId: "s1" }),
  getAuthorizer: async () => ({ id: "mgr", role: "MANAGER" }),
  getPinHash: async () => "h",
  verify: async () => true,
  hasPermission: () => true,
  getLockout: async () => ({ attempts: 0, lockedUntil: null }),
  saveLockout: vi.fn(async () => {}),
  audit: vi.fn(async () => {}),
  newJti: () => "j1",
  ...over,
});

const input = (over: Partial<Parameters<typeof runRequestOverride>[0]> = {}) => ({
  action: "sale:discount:override",
  authorizerUserId: "mgr",
  pin: "428193",
  deviceFingerprint: "f",
  context: "sale-1",
  requestedByUserId: "cashier-1",
  ...over,
});

describe("override", () => {
  it("mints a grant for an authorizer with the permission + valid PIN", async () => {
    const g = await runRequestOverride(input(), deps({}));
    expect(consumeOverride(g, "sale:discount:override", "sale-1")).toBe(true);
  });

  it("rejects an authorizer lacking the permission with a 403 AuthorizationError (genuinely an authorization failure, not a bad credential)", async () => {
    await expect(
      runRequestOverride(
        input({ action: "sale:void", context: "s" }),
        deps({ hasPermission: () => false }),
      ),
    ).rejects.toThrow(AuthorizationError);
  });

  it("consumeOverride rejects a grant for a different action/context", async () => {
    const g = await runRequestOverride(input({ action: "sale:void" }), deps({}));
    expect(consumeOverride(g, "sale:void", "OTHER")).toBe(false);
  });

  it("rejects an unknown/inactive authorizer with a generic message (no enumeration) as a 401 AuthenticationError", async () => {
    await expect(
      runRequestOverride(input(), deps({ getAuthorizer: async () => null })),
    ).rejects.toThrow(AuthenticationError);
    await expect(
      runRequestOverride(input(), deps({ getAuthorizer: async () => null })),
    ).rejects.toThrow(/invalid/i);
  });

  it("rejects a device not enrolled for the authorizer's tenant, and audits it", async () => {
    const audit = vi.fn(async () => {});
    await expect(
      runRequestOverride(input(), deps({ getEnrollment: async () => null, audit })),
    ).rejects.toThrow(/enroll/i);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ event: "POS_OVERRIDE_DENIED", requestedByUserId: "cashier-1" }),
    );
  });

  it("rejects with the SAME generic message and status/code on a wrong PIN as on an unknown authorizer (no enumeration)", async () => {
    let unknownAuthorizerErr: AuthenticationError | undefined;
    let wrongPinErr: AuthenticationError | undefined;
    try {
      await runRequestOverride(input(), deps({ getAuthorizer: async () => null }));
    } catch (e) {
      unknownAuthorizerErr = e as AuthenticationError;
    }
    try {
      await runRequestOverride(input(), deps({ verify: async () => false }));
    } catch (e) {
      wrongPinErr = e as AuthenticationError;
    }
    expect(unknownAuthorizerErr).toBeInstanceOf(AuthenticationError);
    expect(wrongPinErr).toBeInstanceOf(AuthenticationError);
    expect(unknownAuthorizerErr?.message).toBe(wrongPinErr?.message);
    expect(unknownAuthorizerErr?.statusCode).toBe(401);
    expect(wrongPinErr?.statusCode).toBe(401);
  });

  it("locks after max attempts on wrong PIN — this attempt is still a 401 (locking only takes effect on the NEXT attempt) — and audits the failure with full context", async () => {
    const save = vi.fn(async () => {});
    const audit = vi.fn(async () => {});
    await expect(
      runRequestOverride(
        input(),
        deps({
          verify: async () => false,
          getLockout: async () => ({ attempts: 4, lockedUntil: null }),
          saveLockout: save,
          audit,
        }),
      ),
    ).rejects.toThrow(AuthenticationError);
    expect(save).toHaveBeenCalledWith("mgr", "f", expect.objectContaining({ attempts: 5, lockedUntil: expect.any(Number) }));
    expect(audit).toHaveBeenCalledWith({
      event: "POS_OVERRIDE_DENIED",
      authorizerUserId: "mgr",
      action: "sale:discount:override",
      context: "sale-1",
      requestedByUserId: "cashier-1",
    });
  });

  it("refuses when already locked — a 6th attempt is rejected as a 423/PIN_LOCKED without checking the PIN", async () => {
    const getPinHash = vi.fn(async () => "h");
    const audit = vi.fn(async () => {});
    await expect(
      runRequestOverride(
        input(),
        deps({
          getLockout: async () => ({ attempts: 5, lockedUntil: 1_000_000_900_000 }),
          getPinHash,
          audit,
        }),
      ),
    ).rejects.toThrow(PinLockedError);
    try {
      await runRequestOverride(
        input(),
        deps({
          getLockout: async () => ({ attempts: 5, lockedUntil: 1_000_000_900_000 }),
          getPinHash,
          audit,
        }),
      );
    } catch (e) {
      expect((e as PinLockedError).statusCode).toBe(423);
      expect((e as PinLockedError).code).toBe("PIN_LOCKED");
    }
    expect(getPinHash).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ event: "POS_OVERRIDE_LOCKED" }));
  });

  it("resets the lockout on a correct PIN even if the authorizer then lacks permission (403 AuthorizationError)", async () => {
    const save = vi.fn(async () => {});
    await expect(
      runRequestOverride(
        input(),
        deps({ hasPermission: () => false, saveLockout: save, getLockout: async () => ({ attempts: 3, lockedUntil: null }) }),
      ),
    ).rejects.toThrow(AuthorizationError);
    expect(save).toHaveBeenCalledWith("mgr", "f", { attempts: 0, lockedUntil: null });
  });

  it("audits a successful grant with who-authorized, who-requested, action, and context", async () => {
    const audit = vi.fn(async () => {});
    await runRequestOverride(input(), deps({ audit }));
    expect(audit).toHaveBeenCalledWith({
      event: "POS_OVERRIDE_GRANTED",
      authorizerUserId: "mgr",
      action: "sale:discount:override",
      context: "sale-1",
      requestedByUserId: "cashier-1",
    });
  });
});
