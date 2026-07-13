// Public LicenseGuard surface consumed at app startup and by later phases.
export { getDeviceFingerprint, resolveFingerprint } from "./fingerprint";
export type { FingerprintSources } from "./fingerprint";

export { isValidLicenseKey, parseLicenseKey, mintLicenseKey } from "./license-key";

export { evaluateLicenseState } from "./guard";
export type { LicenseState, LicenseStatusValue } from "./guard";

export { createLicenseClient } from "./license-client";
export type { LicensePostFn } from "./license-client";

export { readLicenseStatus } from "./status";
export type { LicenseStatusResponse } from "./status";

export { saveLicenseState, readLicenseState } from "./license-state";
export type { PersistedLicenseState } from "./license-state";
