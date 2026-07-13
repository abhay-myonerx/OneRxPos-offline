import type { LocalDatabase } from "@/local/database";
import { readLicenseState } from "./license-state";
import { evaluateLicenseState, type LicenseStatusValue } from "./guard";
import { verifyLicenseLease } from "@/modules/licensing/license-lease";

export type LicenseStatusResponse = {
  status: LicenseStatusValue;
  plan: string | null;
  lastValidatedAt: number | null;
  graceExpiresAt: number | null;
  fingerprint: string;
};

export function readLicenseStatus(
  db: LocalDatabase,
  key: Buffer,
  opts: { hasKey: boolean; now: number; degradeDays: number; lockoutDays: number; fingerprint: string },
): LicenseStatusResponse {
  const persisted = readLicenseState(db, key);
  const state = evaluateLicenseState({
    hasKey: opts.hasKey,
    lease: persisted?.lease ?? null,
    lastValidatedAt: persisted?.lastValidatedAt ?? null,
    now: opts.now,
    degradeDays: opts.degradeDays,
    lockoutDays: opts.lockoutDays,
  });
  let plan: string | null = null;
  if (persisted?.lease) {
    try {
      plan = verifyLicenseLease(persisted.lease).plan;
    } catch {
      plan = null;
    }
  }
  return {
    status: state.status,
    plan,
    lastValidatedAt: persisted?.lastValidatedAt ?? null,
    graceExpiresAt: state.graceExpiresAt,
    fingerprint: opts.fingerprint,
  };
}
