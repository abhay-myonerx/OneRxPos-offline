import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "@/local/key-derivation";
import { openLocalDb, type LocalDatabase } from "@/local/database";
import { initSchema } from "@/local/schema";
import { readLicenseState, saveLicenseState } from "../license-state";

describe("license-state persistence", () => {
  let dir: string;
  let db: LocalDatabase;
  const key = deriveLocalDbKey("m", "d");

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rxpos-lic-state-"));
    db = openLocalDb({ path: join(dir, "d.db"), key });
    initSchema(db);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when nothing persisted", () => {
    expect(readLicenseState(db, key)).toBeNull();
  });
  it("round-trips lease + lastValidatedAt (single row, upsert)", () => {
    saveLicenseState(db, key, { lease: "lease-1", lastValidatedAt: 1000 });
    saveLicenseState(db, key, { lease: "lease-2", lastValidatedAt: 2000 });
    expect(readLicenseState(db, key)).toEqual({ lease: "lease-2", lastValidatedAt: 2000 });
  });
  it("stores the lease encrypted at rest (not plaintext in the row)", () => {
    saveLicenseState(db, key, { lease: "super-secret-lease", lastValidatedAt: 1 });
    const raw = db.prepare("SELECT lease FROM license_state WHERE id = 1").get() as { lease: string };
    expect(raw.lease).not.toContain("super-secret-lease");
  });
});
