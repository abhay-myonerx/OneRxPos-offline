import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadOrCreateStoreNodeSecrets, secretsFilePath } from "../store-node-config";

describe("loadOrCreateStoreNodeSecrets", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("generates and persists secrets on first call, each >= 32 bytes", () => {
    dir = mkdtempSync(path.join(tmpdir(), "rxpos-secrets-"));

    const secrets = loadOrCreateStoreNodeSecrets(dir);

    const keys = [
      "JWT_ACCESS_SECRET",
      "JWT_REFRESH_SECRET",
      "SYNC_TOKEN_SECRET",
      "LICENSE_TOKEN_SECRET",
      "PIN_PEPPER_SECRET",
      "POS_OVERRIDE_SECRET",
      "LOCAL_DB_MASTER_KEY",
      "SETUP_ACCESS_CODE",
    ] as const;

    for (const key of keys) {
      const value = secrets[key];
      expect(typeof value).toBe("string");
      expect(Buffer.byteLength(value, "utf8")).toBeGreaterThanOrEqual(32);
    }

    // Every secret is unique (not the same value copy-pasted across keys).
    expect(new Set(Object.values(secrets)).size).toBe(keys.length);

    const onDisk = JSON.parse(readFileSync(secretsFilePath(dir), "utf8"));
    expect(onDisk).toEqual(secrets);
  });

  it("is idempotent: a second call reads back the exact same values", () => {
    dir = mkdtempSync(path.join(tmpdir(), "rxpos-secrets-"));

    const first = loadOrCreateStoreNodeSecrets(dir);
    const second = loadOrCreateStoreNodeSecrets(dir);

    expect(second).toEqual(first);
  });

  it("backfills a missing key from an older/partial secrets file without touching the rest", () => {
    dir = mkdtempSync(path.join(tmpdir(), "rxpos-secrets-"));

    const first = loadOrCreateStoreNodeSecrets(dir);
    const onDiskFile = secretsFilePath(dir);
    const partial = JSON.parse(readFileSync(onDiskFile, "utf8"));
    delete partial.LOCAL_DB_MASTER_KEY;
    // Simulate an older secrets file that predates this key.
    writeFileSync(onDiskFile, JSON.stringify(partial));

    const second = loadOrCreateStoreNodeSecrets(dir);

    expect(second.JWT_ACCESS_SECRET).toBe(first.JWT_ACCESS_SECRET);
    expect(typeof second.LOCAL_DB_MASTER_KEY).toBe("string");
    expect(Buffer.byteLength(second.LOCAL_DB_MASTER_KEY, "utf8")).toBeGreaterThanOrEqual(32);
  });
});
