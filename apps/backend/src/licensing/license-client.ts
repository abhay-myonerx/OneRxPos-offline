import { logger } from "@/shared/utils/logger";
import type { LocalDatabase } from "@/local/database";
import { verifyLicenseLease } from "@/modules/licensing/license-lease";
import { saveLicenseState } from "./license-state";

export type LicensePostFn = (
  url: string,
  body: { key: string; fingerprint: string; storeId?: string },
) => Promise<{ status: number; body: { lease?: string } }>;

export interface LicenseClientDeps {
  db: LocalDatabase;
  key: Buffer;
  http: LicensePostFn;
  cloudUrl: string;
  licenseKey: string;
  fingerprint: string;
  storeId?: string;
}

export function createLicenseClient(deps: LicenseClientDeps): {
  activate(now?: number): Promise<{ ok: boolean }>;
  validate(now?: number): Promise<{ ok: boolean }>;
} {
  const { db, key, http, cloudUrl, licenseKey, fingerprint, storeId } = deps;

  async function call(path: "activate" | "validate", now: number): Promise<{ ok: boolean }> {
    let res: Awaited<ReturnType<LicensePostFn>>;
    try {
      res = await http(`${cloudUrl}/${path}`, { key: licenseKey, fingerprint, storeId });
    } catch (err) {
      logger.warn({ err, path }, "license: cloud unreachable — staying in grace");
      return { ok: false };
    }
    if (res.status < 200 || res.status >= 300 || !res.body.lease) {
      logger.warn({ status: res.status, path }, "license: cloud rejected request");
      // Accepted limitation (Phase 0.5 deferrals log): an explicit cloud
      // rejection (e.g. 403 revoked/suspended) currently rides the grace
      // window exactly like an offline/unreachable failure — persisted
      // lastValidatedAt is left untouched, so a revoked license stays usable
      // until the normal lockout elapses. Prompt revocation is deferred.
      return { ok: false };
    }
    try {
      verifyLicenseLease(res.body.lease); // reject forged/expired leases before persisting
    } catch (err) {
      logger.warn({ err, path }, "license: returned lease failed verification");
      return { ok: false };
    }
    saveLicenseState(db, key, { lease: res.body.lease, lastValidatedAt: now });
    return { ok: true };
  }

  return {
    activate: (now = Date.now()) => call("activate", now),
    validate: (now = Date.now()) => call("validate", now),
  };
}
