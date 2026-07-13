import { prisma } from "../../config/database";

export type LicenseRecord = { id: string; tenantId: string; plan: string; seatCap: number; status: string };
export type ActivationRecord = { deviceFingerprint: string; revokedAt: number | null };

export interface LicenseRepo {
  findByKey(key: string): Promise<LicenseRecord | null>;
  listActivations(licenseId: string): Promise<ActivationRecord[]>;
  findActivation(licenseId: string, fingerprint: string): Promise<ActivationRecord | null>;
  createActivation(licenseId: string, fingerprint: string, storeId: string | undefined, now: number): Promise<void>;
  touchActivation(licenseId: string, fingerprint: string, now: number): Promise<void>;
}

export const prismaLicenseRepo: LicenseRepo = {
  async findByKey(key) {
    const l = await prisma.license.findUnique({ where: { key } });
    return l && { id: l.id, tenantId: l.tenantId, plan: l.plan, seatCap: l.seatCap, status: l.status };
  },
  async listActivations(licenseId) {
    const rows = await prisma.deviceActivation.findMany({ where: { licenseId } });
    return rows.map((r) => ({ deviceFingerprint: r.deviceFingerprint, revokedAt: r.revokedAt?.getTime() ?? null }));
  },
  async findActivation(licenseId, fingerprint) {
    const r = await prisma.deviceActivation.findUnique({
      where: { licenseId_deviceFingerprint: { licenseId, deviceFingerprint: fingerprint } },
    });
    return r && { deviceFingerprint: r.deviceFingerprint, revokedAt: r.revokedAt?.getTime() ?? null };
  },
  async createActivation(licenseId, fingerprint, storeId, now) {
    await prisma.deviceActivation.create({
      data: { licenseId, deviceFingerprint: fingerprint, storeId, activatedAt: new Date(now), lastValidatedAt: new Date(now) },
    });
  },
  async touchActivation(licenseId, fingerprint, now) {
    await prisma.deviceActivation.update({
      where: { licenseId_deviceFingerprint: { licenseId, deviceFingerprint: fingerprint } },
      data: { lastValidatedAt: new Date(now) },
    });
  },
};
