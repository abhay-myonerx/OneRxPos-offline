// PIN set (self) + manager reset — Phase 1.1 Task 7.
//
// Queries the raw `prisma` client directly (not `req.db`/`createTenantClient`):
// like `EnrolledDevice`, `UserPin` is auth infrastructure keyed by `userId`
// alone (no `tenantId` column) — see `enroll.service.ts` for the same
// pattern and rationale. Because `UserPin` itself carries no tenantId,
// `resetPin` must independently verify the target `User` belongs to the
// caller's tenant before touching their PIN — otherwise a MANAGER/ADMIN
// token from one tenant could reset the PIN of a user in any other tenant
// by passing an arbitrary `:id` (cross-tenant IDOR).

import { prisma } from "@/config/database";
import { config } from "@/config";
import { AuthenticationError, NotFoundError, PinLockedError, ValidationError } from "@/shared/errors";
import { recordAudit } from "@/shared/utils/auditLog";
import type { AuditAction } from "@/shared/utils/auditLog";
import { issueTokensForUser } from "@/modules/auth/auth.service";

import { getActiveEnrollment } from "./enroll.service";
import { evaluateLockout, nextFailure, type LockoutState } from "./lockout";
import { hashPin, isWeakPin, verifyPin } from "./pin-hash";

/** Throws ValidationError if the PIN is non-6-digit or trivially guessable. */
export function assertPinAcceptable(pin: string): void {
  if (isWeakPin(pin)) {
    throw new ValidationError("PIN is too weak — choose a non-sequential, non-repeating 6-digit PIN");
  }
}

/** Set (or replace) a user's own PIN. */
export async function setPin(userId: string, pin: string): Promise<void> {
  assertPinAcceptable(pin);
  const pinHash = await hashPin(pin);

  await prisma.userPin.upsert({
    where: { userId },
    update: { pinHash },
    create: { userId, pinHash },
  });
}

/**
 * Reset (delete) a user's PIN — forces them to set a new one before
 * quick-login works again. Tenant-scoped: verifies the target user belongs
 * to the caller's tenant before deleting, so a manager/admin token from one
 * tenant cannot reset the PIN of a user in another tenant.
 */
export async function resetPin(userId: string, tenantId: string): Promise<void> {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } });
  if (!user) {
    throw new NotFoundError("User", userId);
  }

  await prisma.userPin.deleteMany({ where: { userId } });
}

// ── PIN quick-login (Phase 1.1 Task 8) ──────────────────────────────────────
//
// SECURITY — tenant resolution: pin-login has NO tenant session (there's no
// `authenticate`/`tenantContext` in front of it — this endpoint IS the
// login). The device `fingerprint` is hardware-derived with no tenant salt,
// and `EnrolledDevice.@@unique([tenantId, fingerprint])` permits the SAME
// fingerprint to exist under two different tenants (a cloned VM or a resold
// terminal re-enrolled elsewhere). So the tenant MUST be resolved from the
// globally-unique `userId` FIRST (`getUser`), and the device must then be
// confirmed via the COMPOUND `getEnrollment(user.tenantId, fingerprint)` —
// NEVER by fingerprint alone, which would non-deterministically match
// whichever tenant happened to enroll that fingerprint (cross-tenant leak).
// This was flagged by two prior task reviews (Task 2, Task 7) — do not
// "simplify" this back to a fingerprint-only lookup.
//
// An unknown or inactive user is rejected with the SAME generic error as a
// bad PIN, so the endpoint can't be used to enumerate valid user IDs.

export interface PinLoginDeps {
  now: number;
  maxAttempts: number;
  lockoutMs: number;
  /** Resolve tenant from the globally-unique userId FIRST (security: see the note above). */
  getUser(
    userId: string,
  ): Promise<{ tenantId: string; storeId: string | null; isActive: boolean; tenantStatus: string } | null>;
  /** Device lookup is by the COMPOUND (tenantId, fingerprint) — never fingerprint alone. */
  getEnrollment(tenantId: string, fp: string): Promise<{ tenantId: string; storeId: string } | null>;
  getPinHash(userId: string): Promise<string | null>;
  verify(pin: string, hash: string): Promise<boolean>;
  getLockout(userId: string, fp: string): Promise<LockoutState>;
  saveLockout(userId: string, fp: string, s: LockoutState): Promise<void>;
  audit(event: string, userId: string, fp: string): Promise<void>;
  issue(userId: string, tenantId: string, storeId: string): Promise<{ accessToken: string; refreshToken: string }>;
}

export interface PinLoginInput {
  deviceFingerprint: string;
  userId: string;
  pin: string;
}

/** Pure orchestration over injected deps — see the SECURITY note above. */
export async function runPinLogin(
  input: PinLoginInput,
  d: PinLoginDeps,
): Promise<{ accessToken: string; refreshToken: string }> {
  const { deviceFingerprint: fp, userId, pin } = input;

  // 1) Resolve tenant from the user (never trust the fingerprint to pick a tenant).
  const user = await d.getUser(userId);
  if (!user || !user.isActive) throw new AuthenticationError("Invalid credentials");

  // Tenant-suspension gate: a suspended/cancelled tenant's users must not be
  // able to mint tokens via PIN quick-login just because password login()'s
  // gate doesn't run on this path. Kept generic here — the message-specific
  // rejection lives in `issueTokensForUser` (the authoritative gate), this
  // is defense-in-depth so the check is enforced even before that call.
  if (user.tenantStatus === "SUSPENDED" || user.tenantStatus === "CANCELLED") {
    throw new AuthenticationError("Invalid credentials");
  }

  // 2) Confirm the device is enrolled for THIS user's tenant (compound lookup).
  const enroll = await d.getEnrollment(user.tenantId, fp);
  if (!enroll) throw new AuthenticationError("Device is not enrolled");

  const lock = await d.getLockout(userId, fp);
  if (evaluateLockout(lock, d.now, d.maxAttempts, d.lockoutMs).locked) {
    await d.audit("PIN_LOGIN_LOCKED", userId, fp);
    throw new PinLockedError();
  }

  const hash = await d.getPinHash(userId);
  if (!hash || !(await d.verify(pin, hash))) {
    const ns = nextFailure(lock, d.now, d.maxAttempts, d.lockoutMs);
    await d.saveLockout(userId, fp, ns);
    await d.audit("PIN_LOGIN_FAILED", userId, fp);
    throw new AuthenticationError("Invalid PIN");
  }

  await d.saveLockout(userId, fp, { attempts: 0, lockedUntil: null }); // reset on success

  // Session store context = the enrolled device's store (the till), tenant = the user's tenant.
  return d.issue(userId, user.tenantId, enroll.storeId);
}

/**
 * Real-deps wiring for `runPinLogin` — builds `PinLoginDeps` from the raw
 * `prisma` client (there's no `req.db`/`createTenantClient` here: this IS
 * the login, so no tenant-scoped client exists yet).
 */
export async function pinLogin(
  input: PinLoginInput,
): Promise<{ accessToken: string; refreshToken: string }> {
  // Captured once `getUser` resolves the caller's tenant, so `audit` (which
  // only receives userId/fp per the PinLoginDeps shape) can still write a
  // correctly tenant-scoped audit row.
  let resolvedTenantId: string | undefined;

  const deps: PinLoginDeps = {
    now: Date.now(),
    maxAttempts: config.PIN_MAX_ATTEMPTS,
    lockoutMs: config.PIN_LOCKOUT_MINUTES * 60_000,

    getUser: async (userId) => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          tenantId: true,
          storeId: true,
          isActive: true,
          tenant: { select: { status: true } },
        },
      });
      if (!user) return null;
      resolvedTenantId = user.tenantId;
      return {
        tenantId: user.tenantId,
        storeId: user.storeId,
        isActive: user.isActive,
        tenantStatus: user.tenant.status,
      };
    },

    getEnrollment: (tenantId, fp) => getActiveEnrollment(tenantId, fp),

    getPinHash: async (userId) => {
      const row = await prisma.userPin.findUnique({ where: { userId } });
      return row?.pinHash ?? null;
    },

    verify: verifyPin,

    getLockout: async (userId, fp) => {
      const row = await prisma.pinLockout.findUnique({
        where: { userId_fingerprint: { userId, fingerprint: fp } },
      });
      return row
        ? { attempts: row.attempts, lockedUntil: row.lockedUntil ? row.lockedUntil.getTime() : null }
        : { attempts: 0, lockedUntil: null };
    },

    saveLockout: async (userId, fp, s) => {
      await prisma.pinLockout.upsert({
        where: { userId_fingerprint: { userId, fingerprint: fp } },
        update: { attempts: s.attempts, lockedUntil: s.lockedUntil ? new Date(s.lockedUntil) : null },
        create: {
          userId,
          fingerprint: fp,
          attempts: s.attempts,
          lockedUntil: s.lockedUntil ? new Date(s.lockedUntil) : null,
        },
      });
    },

    audit: async (event, userId, fp) => {
      // getUser always runs before audit in runPinLogin, so resolvedTenantId
      // is set for every reachable audit call; the guard is defense-in-depth.
      if (!resolvedTenantId) return;
      await recordAudit({
        tenantId: resolvedTenantId,
        userId,
        action: event as AuditAction,
        entityType: "PinLogin",
        entityId: fp,
      });
    },

    issue: (userId, tenantId, storeId) => issueTokensForUser(userId, tenantId, storeId),
  };

  return runPinLogin(input, deps);
}
