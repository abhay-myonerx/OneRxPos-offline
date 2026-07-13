import { NotFoundError, AuthorizationError, ConflictError } from "@/shared/errors";
import { decideActivation } from "./licensing.decide";
import { mintLicenseLease } from "./license-lease";
import type { LicenseRepo } from "./licensing.repo";

export type { LicenseRepo, LicenseRecord, ActivationRecord } from "./licensing.repo";

export function createLicensingService(repo: LicenseRepo) {
  async function leaseFor(license: { id: string; tenantId: string; plan: string; seatCap: number }, fingerprint: string) {
    return mintLicenseLease({
      licenseId: license.id,
      tenantId: license.tenantId,
      deviceFingerprint: fingerprint,
      plan: license.plan,
      seat: license.seatCap,
    });
  }

  async function activate(input: { key: string; fingerprint: string; storeId?: string }): Promise<{ lease: string }> {
    const license = await repo.findByKey(input.key);
    if (!license) throw new NotFoundError("License", input.key);

    const activations = await repo.listActivations(license.id);
    const decision = decideActivation({
      licenseStatus: license.status,
      seatCap: license.seatCap,
      fingerprint: input.fingerprint,
      activations,
    });

    const now = Date.now();
    switch (decision.action) {
      case "reject-status":
        throw new AuthorizationError(`License is ${license.status}`);
      case "reject-cap":
        throw new ConflictError("License seat cap reached — cannot activate this device");
      case "reuse":
        await repo.touchActivation(license.id, input.fingerprint, now);
        break;
      case "create":
        await repo.createActivation(license.id, input.fingerprint, input.storeId, now);
        break;
    }
    return { lease: await leaseFor(license, input.fingerprint) };
  }

  async function validate(input: { key: string; fingerprint: string }): Promise<{ lease: string }> {
    const license = await repo.findByKey(input.key);
    if (!license) throw new NotFoundError("License", input.key);
    if (license.status !== "active") throw new AuthorizationError(`License is ${license.status}`);

    const activation = await repo.findActivation(license.id, input.fingerprint);
    if (!activation || activation.revokedAt != null)
      throw new AuthorizationError("Device is not activated for this license");

    await repo.touchActivation(license.id, input.fingerprint, Date.now());
    return { lease: await leaseFor(license, input.fingerprint) };
  }

  return { activate, validate };
}
