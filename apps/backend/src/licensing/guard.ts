export type LicenseStatusValue = "active" | "degraded" | "locked" | "unlicensed";
export type LicenseState = { status: LicenseStatusValue; graceExpiresAt: number | null };

const DAY = 86_400_000;

// Pure grace evaluation. Grace is measured from lastValidatedAt (the last time
// the cloud confirmed the binding). Injected `now` keeps this deterministic.
export function evaluateLicenseState(input: {
  hasKey: boolean;
  lease: string | null;
  lastValidatedAt: number | null;
  now: number;
  degradeDays: number;
  lockoutDays: number;
}): LicenseState {
  if (!input.hasKey || !input.lease || input.lastValidatedAt == null) {
    return { status: "unlicensed", graceExpiresAt: null };
  }
  const ageDays = (input.now - input.lastValidatedAt) / DAY;
  const graceExpiresAt = input.lastValidatedAt + input.lockoutDays * DAY;
  let status: LicenseStatusValue;
  if (ageDays > input.lockoutDays) status = "locked";
  else if (ageDays > input.degradeDays) status = "degraded";
  else status = "active";
  return { status, graceExpiresAt };
}
