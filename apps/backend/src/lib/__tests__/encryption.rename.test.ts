import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import {
  __setMasterKeyForTests,
  deriveTenantKey,
  encryptForTenant,
  decryptForTenant,
  LEGACY_HKDF_BRAND,
} from "../encryption";

const TID = "tenant-1";
const V = 1;

// Reproduce the wire format but derive with the LEGACY brand, to simulate
// ciphertext written before the rename.
function encryptLegacy(plaintext: string, tenantId: string, version: number): string {
  const key = deriveTenantKey(tenantId, version, LEGACY_HKDF_BRAND);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([version]), iv, ct, tag]).toString("base64url");
}

describe("encryption dual-brand rename", () => {
  beforeAll(() => __setMasterKeyForTests(crypto.randomBytes(32)));
  afterAll(() => __setMasterKeyForTests(null));

  it("decrypts legacy-brand ciphertext (backward compat)", () => {
    const legacy = encryptLegacy("secret-pii", TID, V);
    expect(decryptForTenant(legacy, TID)).toBe("secret-pii");
  });
  it("round-trips new rxpos-brand ciphertext", () => {
    expect(decryptForTenant(encryptForTenant("hello", TID, V), TID)).toBe("hello");
  });
  it("throws on a tampered ciphertext (both brands fail)", () => {
    const good = encryptForTenant("x", TID, V);
    const buf = Buffer.from(good, "base64url");
    buf[buf.length - 1] ^= 0xff; // flip a tag byte
    expect(() => decryptForTenant(buf.toString("base64url"), TID)).toThrow();
  });
  it("throws when decrypting with the wrong tenant (both brands fail)", () => {
    const ct = encryptForTenant("x", TID, V);
    expect(() => decryptForTenant(ct, "other-tenant")).toThrow();
  });
});
