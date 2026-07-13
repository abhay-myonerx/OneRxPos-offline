import { describe, it, expect } from "vitest";
import { createLicensingService, type LicenseRepo, type ActivationRecord } from "../licensing.service";
import { verifyLicenseLease } from "../license-lease";
import { NotFoundError } from "@/shared/errors";

function fakeRepo(
  seat: number,
  status = "active",
): LicenseRepo & { acts: ActivationRecord[]; touched: Array<{ fingerprint: string; now: number }> } {
  const acts: ActivationRecord[] = [];
  const touched: Array<{ fingerprint: string; now: number }> = [];
  return {
    acts,
    touched,
    async findByKey() {
      return { id: "lic-1", tenantId: "t-1", plan: "standard", seatCap: seat, status };
    },
    async listActivations() {
      return acts;
    },
    async findActivation(_l, fp) {
      return acts.find((a) => a.deviceFingerprint === fp) ?? null;
    },
    async createActivation(_l, fp) {
      acts.push({ deviceFingerprint: fp, revokedAt: null });
    },
    async touchActivation(_l, fp, now) {
      touched.push({ fingerprint: fp, now });
    },
  };
}

function fakeRepoUnknownKey(): LicenseRepo {
  return {
    async findByKey() {
      return null;
    },
    async listActivations() {
      return [];
    },
    async findActivation() {
      return null;
    },
    async createActivation() {},
    async touchActivation() {},
  };
}

const KEY = "AAAAA-AAAAA-AAAAA-AAAAA"; // service does not re-check checksum; validation layer does

describe("licensing service activate", () => {
  it("activates a fresh device and returns a verifiable lease bound to the fingerprint", async () => {
    const svc = createLicensingService(fakeRepo(1));
    const { lease } = await svc.activate({ key: KEY, fingerprint: "fp-A" });
    expect(verifyLicenseLease(lease).deviceFingerprint).toBe("fp-A");
  });
  it("is idempotent for the same device", async () => {
    const repo = fakeRepo(1);
    const svc = createLicensingService(repo);
    await svc.activate({ key: KEY, fingerprint: "fp-A" });
    await svc.activate({ key: KEY, fingerprint: "fp-A" });
    expect(repo.acts).toHaveLength(1);
  });
  it("rejects a new device beyond the seat cap", async () => {
    const svc = createLicensingService(fakeRepo(1));
    await svc.activate({ key: KEY, fingerprint: "fp-A" });
    await expect(svc.activate({ key: KEY, fingerprint: "fp-B" })).rejects.toThrow(/seat/i);
  });
});

describe("licensing service validate", () => {
  it("rejects when the device has no activation", async () => {
    const svc = createLicensingService(fakeRepo(1));
    await expect(svc.validate({ key: KEY, fingerprint: "fp-X" })).rejects.toThrow();
  });

  it("validates an activated device, returns a verifiable lease, and bumps lastValidatedAt", async () => {
    const repo = fakeRepo(1);
    const svc = createLicensingService(repo);
    await svc.activate({ key: KEY, fingerprint: "fp-A" });
    expect(repo.touched).toHaveLength(0);

    const { lease } = await svc.validate({ key: KEY, fingerprint: "fp-A" });

    expect(verifyLicenseLease(lease).deviceFingerprint).toBe("fp-A");
    expect(repo.touched).toHaveLength(1);
    expect(repo.touched[0].fingerprint).toBe("fp-A");
  });

  it("rejects validation for an unknown license key", async () => {
    const svc = createLicensingService(fakeRepoUnknownKey());
    await expect(svc.validate({ key: KEY, fingerprint: "fp-A" })).rejects.toThrow(NotFoundError);
  });

  it("rejects validation when the license is not active", async () => {
    const repo = fakeRepo(1, "suspended");
    repo.acts.push({ deviceFingerprint: "fp-A", revokedAt: null });
    const svc = createLicensingService(repo);
    await expect(svc.validate({ key: KEY, fingerprint: "fp-A" })).rejects.toThrow(/suspended/i);
  });

  it("rejects validation when the device's activation has been revoked", async () => {
    const repo = fakeRepo(1);
    repo.acts.push({ deviceFingerprint: "fp-A", revokedAt: Date.now() });
    const svc = createLicensingService(repo);
    await expect(svc.validate({ key: KEY, fingerprint: "fp-A" })).rejects.toThrow();
  });
});
