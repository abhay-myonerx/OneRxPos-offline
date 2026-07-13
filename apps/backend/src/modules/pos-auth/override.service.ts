// Inline-PIN manager override — Phase 1.1 Task 9.
//
// A cashier hits a gated action (e.g. `sale:discount:override`) that their
// own role does not hold. Rather than logging out and back in as a
// manager, a higher-role user authorizes the ONE action inline, on the
// SAME device, with their own PIN. This mints a short-lived (2m, see
// `override-grant.ts`), single-use grant bound to the specific
// `action` + `context` (e.g. the sale id) — the caller then presents the
// grant back to the gated endpoint, which calls `consumeOverride` to
// verify it before proceeding.
//
// SECURITY — mirrors `pin.service.ts`'s `runPinLogin` tenant-resolution
// pattern: the authorizer's tenant must be resolved from the
// globally-unique `authorizerUserId` FIRST, and the device enrollment
// check must be by the COMPOUND (tenantId, fingerprint) — never
// fingerprint alone (see the note in `pin.service.ts` for why: the same
// fingerprint can be enrolled under two different tenants). The real-deps
// wiring below (`requestOverride`) additionally requires the authorizer to
// belong to the SAME tenant as the calling (cashier) session — otherwise a
// cashier could name an arbitrary `authorizerUserId` from another tenant
// (cross-tenant IDOR), which the pure orchestration alone cannot prevent
// since it has no notion of "the caller's tenant".
//
// SECURITY — brute force: the authorizer's PIN is checked against the SAME
// per-(authorizerUserId, fingerprint) `PinLockout` row used by pin-login's
// `runPinLogin` (see `pin.service.ts`). Without this, `/override` would let
// an authenticated cashier hammer a manager's 6-digit PIN with unlimited
// guesses, bypassing pin-login's lockout entirely (the two paths now share
// one lockout counter per user+device, so failed attempts on either count
// toward the same lock).
//
// Every rejection branch (unknown/inactive/cross-tenant authorizer, locked,
// wrong PIN, lacks permission) writes an audit entry — including the
// pre-tenant-resolution branches, which audit against the CALLING cashier
// session's tenant (passed in as `callerTenantId`) since the authorizer's
// own tenant isn't known yet at that point.
//
// Single-use / replay: for Phase 1.1 the 2-minute expiry (`override-grant.ts`)
// plus the action+context binding checked by `consumeOverride` are the
// guard. Tracking `jti` against replay within that 2-minute window (e.g. in
// Redis) is a documented follow-up, not implemented here.

import { randomUUID, createHash } from "crypto";

import { prisma } from "@/config/database";
import { config } from "@/config";
import { AuthenticationError, AuthorizationError, PinLockedError } from "@/shared/errors";
import { recordAudit } from "@/shared/utils/auditLog";
import type { AuditAction } from "@/shared/utils/auditLog";
import { userHasPermission } from "@/middleware/authorize";
import type { Role, Permission } from "@/shared/types/enums";

import { getActiveEnrollment } from "./enroll.service";
import { evaluateLockout, nextFailure, type LockoutState } from "./lockout";
import { verifyPin } from "./pin-hash";
import { mintOverrideGrant, verifyOverrideGrant } from "./override-grant";

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

// ─── Action label -> permission mapping (request-time permission check ONLY) ──
//
// Phase 1.3a's ringup-mechanics gated actions are minted/consumed under
// UPPER_SNAKE labels (`PRICE_OVERRIDE`, `DISCOUNT_OVER_CAP`, `VOID_LINE`,
// `VOID_TRANSACTION`, `OPEN_PRICE_ITEM`) — that's the grant/consume identity
// (`mintOverrideGrant`, `consumeOverride`, `SaleOverride.action`) and must NOT
// change. But `ROLE_PERMISSIONS` (enums.ts) grants MANAGER/ADMIN the
// COLON-form permission strings (`price:override`, `sale:void`,
// `sale:discount:override`), so checking `userHasPermission(role, action)`
// with the raw UPPER_SNAKE label always fails — no manager can ever satisfy
// it. This map translates the action label to the permission string ONLY at
// the request-time permission check below; grant minting/consuming/audit all
// keep using the raw `action` label unchanged.
const ACTION_PERMISSION: Record<string, string> = {
  PRICE_OVERRIDE: "price:override",
  OPEN_PRICE_ITEM: "price:override",
  VOID_LINE: "sale:void",
  VOID_TRANSACTION: "sale:void",
  DISCOUNT_OVER_CAP: "sale:discount:override",
  CREDIT_LIMIT_OVERRIDE: "sale:credit:override",
  // Phase 2.2 — pharmacist behind-counter consult authorization. NOTE: there is
  // no dedicated PHARMACIST role yet; for now the "pharmacist" is whoever holds
  // `rx:consult` (granted to MANAGER/ADMIN/SUPER_ADMIN, see ROLE_PERMISSIONS). A
  // dedicated PHARMACIST role is a future addition.
  RX_CONSULT: "rx:consult",
};

/**
 * Maps an override action LABEL to the permission string `userHasPermission`
 * should check. Unknown labels (including 1.1's colon-form permission
 * strings passed directly as `action`, e.g. `sale:discount:override`) fall
 * through unchanged, preserving those callers.
 */
function permissionForAction(action: string): string {
  return ACTION_PERMISSION[action] ?? action;
}

export interface OverrideRequestInput {
  action: string;
  authorizerUserId: string;
  pin: string;
  deviceFingerprint: string;
  context: string;
}

/** Params passed to `OverrideDeps.audit` — every rejection AND the success path go through this, always with the full context (see the SECURITY note above on why no branch may skip auditing). */
export interface OverrideAuditParams {
  event: "POS_OVERRIDE_GRANTED" | "POS_OVERRIDE_DENIED" | "POS_OVERRIDE_LOCKED";
  authorizerUserId: string;
  action: string;
  context: string;
  /** The calling cashier's userId — who REQUESTED the override (distinct from who authorized it). */
  requestedByUserId: string;
}

export interface OverrideDeps {
  now: number;
  maxAttempts: number;
  lockoutMs: number;
  /** Device enrollment for the authorizer's tenant. Compound-scoped in the real wiring (see SECURITY note above). */
  getEnrollment(authorizerUserId: string, fingerprint: string): Promise<{ tenantId: string; storeId: string } | null>;
  /** Resolves the authorizer's id + role. Real wiring returns `null` for an unknown OR inactive user (generic rejection — no enumeration). */
  getAuthorizer(authorizerUserId: string): Promise<{ id: string; role: string } | null>;
  getPinHash(authorizerUserId: string): Promise<string | null>;
  verify(pin: string, hash: string): Promise<boolean>;
  /** Does the authorizer's role hold `action`'s permission (honors the `"*"` wildcard)? */
  hasPermission(role: string, action: string): boolean;
  /** Shared with pin-login's `PinLockout` row, keyed by (authorizerUserId, fingerprint) — see the SECURITY note above. */
  getLockout(authorizerUserId: string, fp: string): Promise<LockoutState>;
  saveLockout(authorizerUserId: string, fp: string, s: LockoutState): Promise<void>;
  audit(params: OverrideAuditParams): Promise<void>;
  /** Unique grant id (`jti`). */
  newJti(): string;
}

/**
 * Pure orchestration over injected deps — see the SECURITY note above.
 * Verifies (in order): the authorizer exists/is active, the device is
 * enrolled for the authorizer's tenant, the authorizer's (user, device)
 * pair is not lockout-locked, the authorizer's PIN, then that the
 * authorizer HOLDS the action's permission — then mints a single-use
 * signed grant + records an audit entry. Throws (rejects) on any failed
 * check, and audits EVERY rejection branch (not just PIN/permission
 * failures).
 */
export async function runRequestOverride(
  input: OverrideRequestInput & { requestedByUserId: string },
  d: OverrideDeps,
): Promise<string> {
  const { action, authorizerUserId, pin, deviceFingerprint, context, requestedByUserId } = input;

  const audit = (event: OverrideAuditParams["event"]) =>
    d.audit({ event, authorizerUserId, action, context, requestedByUserId });

  const authorizer = await d.getAuthorizer(authorizerUserId);
  if (!authorizer) {
    await audit("POS_OVERRIDE_DENIED");
    // Generic — collapsed with the wrong-PIN rejection below so an
    // authenticated cashier can't enumerate valid same-tenant user ids by
    // message difference (Fix 3). A bad/unknown credential, same as
    // pin-login's `runPinLogin` — 401 (AuthenticationError), not 403.
    throw new AuthenticationError("Invalid authorizer or PIN");
  }

  const enrollment = await d.getEnrollment(authorizerUserId, deviceFingerprint);
  if (!enrollment) {
    await audit("POS_OVERRIDE_DENIED");
    throw new AuthorizationError("Device is not enrolled");
  }

  const lock = await d.getLockout(authorizerUserId, deviceFingerprint);
  if (evaluateLockout(lock, d.now, d.maxAttempts, d.lockoutMs).locked) {
    await audit("POS_OVERRIDE_LOCKED");
    // Same 423/PIN_LOCKED as pin-login's `runPinLogin` — distinct from a
    // plain wrong-PIN 401 so the PIN pad UI can branch on status/code.
    throw new PinLockedError();
  }

  const hash = await d.getPinHash(authorizerUserId);
  if (!hash || !(await d.verify(pin, hash))) {
    const ns = nextFailure(lock, d.now, d.maxAttempts, d.lockoutMs);
    await d.saveLockout(authorizerUserId, deviceFingerprint, ns);
    await audit("POS_OVERRIDE_DENIED");
    // Bad credential — 401 (AuthenticationError), same as pin-login, not 403.
    throw new AuthenticationError("Invalid authorizer or PIN");
  }

  await d.saveLockout(authorizerUserId, deviceFingerprint, { attempts: 0, lockedUntil: null }); // reset on a correct PIN

  if (!d.hasPermission(authorizer.role, permissionForAction(action))) {
    await audit("POS_OVERRIDE_DENIED");
    throw new AuthorizationError(`Authorizer lacks permission for ${action}`);
  }

  const jti = d.newJti();
  const contextHash = sha256(context);
  const grant = mintOverrideGrant({ action, authorizerUserId, contextHash, jti });

  await audit("POS_OVERRIDE_GRANTED");

  return grant;
}

/**
 * Redeem a grant: valid signature/expiry (`verifyOverrideGrant`) AND bound
 * to THIS `action` AND THIS `context` (contextHash match). Single-use in
 * the sense that grants expire in 2 minutes and are scoped to one
 * action+context — see the "Single-use / replay" note above for what's
 * deferred.
 */
export function consumeOverride(grant: string, action: string, context: string): boolean {
  try {
    const claims = verifyOverrideGrant(grant);
    return claims.action === action && claims.contextHash === sha256(context);
  } catch {
    return false;
  }
}

/**
 * Real-deps wiring for `runRequestOverride` — builds `OverrideDeps` from
 * the raw `prisma` client (like `pin.service.ts`'s `pinLogin`, this is auth
 * infrastructure querying `prisma.user`/`UserPin`/`EnrolledDevice` directly,
 * not `req.db`/`createTenantClient`).
 *
 * `callerTenantId` is the CALLING (cashier) session's tenant — the
 * authorizer named in `input` must belong to this SAME tenant, or they are
 * treated as unknown (generic rejection), preventing a cashier from naming
 * an arbitrary cross-tenant `authorizerUserId`. It also doubles as the
 * fallback tenant for audit entries written BEFORE the authorizer's own
 * tenant is resolved (unknown/inactive/cross-tenant authorizer) — see the
 * SECURITY note above; those rejections must still be audited.
 *
 * `callerUserId` is the calling cashier's own userId — recorded as
 * `requestedByUserId` on every audit entry (who requested the override,
 * as distinct from who authorized it).
 */
export async function requestOverride(
  input: OverrideRequestInput,
  callerTenantId: string,
  callerUserId: string,
): Promise<string> {
  // Captured once `getAuthorizer` resolves the authorizer's tenant, so
  // `getEnrollment` (compound-scoped) can use it. `audit` falls back to
  // `callerTenantId` when this is still unset (pre-tenant-resolution
  // rejections), so no rejection branch is ever left unaudited.
  let resolvedTenantId: string | undefined;

  const deps: OverrideDeps = {
    now: Date.now(),
    maxAttempts: config.PIN_MAX_ATTEMPTS,
    lockoutMs: config.PIN_LOCKOUT_MINUTES * 60_000,

    getAuthorizer: async (authorizerUserId) => {
      const user = await prisma.user.findUnique({
        where: { id: authorizerUserId },
        select: { tenantId: true, role: true, isActive: true },
      });
      if (!user || !user.isActive) return null;
      // Cross-tenant IDOR guard: the authorizer must belong to the SAME
      // tenant as the calling (cashier) session.
      if (user.tenantId !== callerTenantId) return null;
      resolvedTenantId = user.tenantId;
      return { id: authorizerUserId, role: user.role };
    },

    getEnrollment: async (_authorizerUserId, fingerprint) => {
      // `getAuthorizer` always runs before `getEnrollment` in
      // `runRequestOverride`, so `resolvedTenantId` is set for every
      // reachable call here; the guard is defense-in-depth.
      if (!resolvedTenantId) return null;
      return getActiveEnrollment(resolvedTenantId, fingerprint);
    },

    getPinHash: async (authorizerUserId) => {
      const row = await prisma.userPin.findUnique({ where: { userId: authorizerUserId } });
      return row?.pinHash ?? null;
    },

    verify: verifyPin,

    // `action` here is an arbitrary caller-supplied gated-action string (validated
    // against the known Permission set only implicitly, by whether ROLE_PERMISSIONS
    // contains it) — cast to Permission for the shared `userHasPermission` signature.
    hasPermission: (role, action) => userHasPermission(role as Role, action as Permission),

    // Shared with `pin.service.ts`'s `pinLogin` — the SAME `PinLockout` row
    // per (userId, fingerprint), so failed override attempts and failed
    // login attempts both count toward one lockout per user+device.
    getLockout: async (authorizerUserId, fp) => {
      const row = await prisma.pinLockout.findUnique({
        where: { userId_fingerprint: { userId: authorizerUserId, fingerprint: fp } },
      });
      return row
        ? { attempts: row.attempts, lockedUntil: row.lockedUntil ? row.lockedUntil.getTime() : null }
        : { attempts: 0, lockedUntil: null };
    },

    saveLockout: async (authorizerUserId, fp, s) => {
      await prisma.pinLockout.upsert({
        where: { userId_fingerprint: { userId: authorizerUserId, fingerprint: fp } },
        update: { attempts: s.attempts, lockedUntil: s.lockedUntil ? new Date(s.lockedUntil) : null },
        create: {
          userId: authorizerUserId,
          fingerprint: fp,
          attempts: s.attempts,
          lockedUntil: s.lockedUntil ? new Date(s.lockedUntil) : null,
        },
      });
    },

    audit: async ({ event, authorizerUserId, action, context, requestedByUserId }) => {
      // Pre-tenant-resolution rejections (unknown/inactive/cross-tenant
      // authorizer) fall back to the CALLING cashier session's tenant —
      // audited, never skipped (Fix 2).
      const tenantId = resolvedTenantId ?? callerTenantId;
      await recordAudit({
        tenantId,
        userId: authorizerUserId,
        action: event as AuditAction,
        entityType: "PosOverride",
        entityId: action,
        newData: { authorizerUserId, requestedByUserId, action, context },
      });
    },

    newJti: () => randomUUID(),
  };

  return runRequestOverride({ ...input, requestedByUserId: callerUserId }, deps);
}

/**
 * Redeem + audit an override grant for a PRE-checkout gated action (e.g.
 * void line, clear transaction — Phase 1.3a) that never reaches a
 * persisted sale, so its audit must happen at action time rather than
 * riding along on a sale's own audit trail.
 *
 * Verifies the grant with `consumeOverride` (action+context binding,
 * signature, expiry), then writes an audit entry through the SAME
 * `recordAudit` writer `requestOverride` above uses (no second audit
 * path) — `POS_OVERRIDE_CONSUMED` on success, `POS_OVERRIDE_CONSUME_FAILED`
 * on any failure (wrong action/context binding, expired, malformed).
 * `cashierUserId` is the ring-up cashier consuming the grant, recorded as
 * both the audit row's `userId` and `requestedByUserId` in `newData` —
 * distinct from the grant's own `authorizerUserId` (who approved it),
 * which `consumeOverride` deliberately does not surface here (it verifies
 * the grant, not who minted it).
 */
export async function runConsumeOverride(args: {
  grant: string;
  action: string;
  context: string;
  cashierUserId: string;
  tenantId: string;
}): Promise<boolean> {
  const { grant, action, context, cashierUserId, tenantId } = args;

  const ok = consumeOverride(grant, action, context);

  await recordAudit({
    tenantId,
    userId: cashierUserId,
    action: ok ? "POS_OVERRIDE_CONSUMED" : "POS_OVERRIDE_CONSUME_FAILED",
    entityType: "PosOverride",
    entityId: action,
    newData: { action, context, requestedByUserId: cashierUserId },
  });

  return ok;
}
