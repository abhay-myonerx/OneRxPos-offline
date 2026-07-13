import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "@/local/key-derivation";
import { openLocalDb, type LocalDatabase } from "@/local/database";
import { initSchema } from "@/local/schema";
import { readLicenseState } from "../license-state";
import { mintLicenseLease } from "@/modules/licensing/license-lease";
import { createLicenseClient, type LicensePostFn } from "../license-client";

const FP = "f".repeat(64);
const validLease = () =>
  mintLicenseLease({ licenseId: "lic-1", tenantId: "t-1", deviceFingerprint: FP, plan: "standard", seat: 1 });

describe("license client", () => {
  let dir: string;
  let db: LocalDatabase;
  const key = deriveLocalDbKey("m", "d");

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rxpos-lic-client-"));
    db = openLocalDb({ path: join(dir, "d.db"), key });
    initSchema(db);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const client = (http: LicensePostFn) =>
    createLicenseClient({ db, key, http, cloudUrl: "http://cloud/api/v2/license", licenseKey: "K", fingerprint: FP });

  it("activate persists a verified lease + lastValidatedAt", async () => {
    const http: LicensePostFn = async () => ({ status: 200, body: { lease: validLease() } });
    const res = await client(http).activate(5000);
    expect(res.ok).toBe(true);
    expect(readLicenseState(db, key)).toMatchObject({ lastValidatedAt: 5000 });
  });

  it("offline validate (network throw) leaves lastValidatedAt untouched", async () => {
    const good: LicensePostFn = async () => ({ status: 200, body: { lease: validLease() } });
    await client(good).validate(1000);
    const offline: LicensePostFn = async () => {
      throw new Error("ECONNREFUSED");
    };
    const res = await client(offline).validate(9999);
    expect(res.ok).toBe(false);
    expect(readLicenseState(db, key)!.lastValidatedAt).toBe(1000); // unchanged -> grace counts down
  });

  it("rejects and does not persist a lease with a bad signature", async () => {
    const http: LicensePostFn = async () => ({ status: 200, body: { lease: "not.a.jwt" } });
    const res = await client(http).validate(1000);
    expect(res.ok).toBe(false);
    expect(readLicenseState(db, key)).toBeNull();
  });
});
