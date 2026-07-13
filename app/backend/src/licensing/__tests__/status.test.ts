import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "@/local/key-derivation";
import { openLocalDb, type LocalDatabase } from "@/local/database";
import { initSchema } from "@/local/schema";
import { saveLicenseState } from "../license-state";
import { mintLicenseLease } from "@/modules/licensing/license-lease";
import { readLicenseStatus } from "../status";

const FP = "f".repeat(64);
const DAY = 86_400_000;
const T0 = 1_000_000_000_000;

describe("readLicenseStatus", () => {
  let dir: string;
  let db: LocalDatabase;
  const key = deriveLocalDbKey("m", "d");
  const opts = (now: number, hasKey = true) => ({ hasKey, now, degradeDays: 7, lockoutDays: 30, fingerprint: FP });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rxpos-lic-status-"));
    db = openLocalDb({ path: join(dir, "d.db"), key });
    initSchema(db);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("unlicensed with no persisted state", () => {
    expect(readLicenseStatus(db, key, opts(T0)).status).toBe("unlicensed");
  });
  it("active + exposes plan from the persisted lease", () => {
    const lease = mintLicenseLease({ licenseId: "l", tenantId: "t", deviceFingerprint: FP, plan: "pharmacy", seat: 1 });
    saveLicenseState(db, key, { lease, lastValidatedAt: T0 });
    const r = readLicenseStatus(db, key, opts(T0 + DAY));
    expect(r.status).toBe("active");
    expect(r.plan).toBe("pharmacy");
    expect(r.fingerprint).toBe(FP);
  });
});
