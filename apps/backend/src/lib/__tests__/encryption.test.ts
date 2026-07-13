// Regression suite for the per-tenant HKDF + AES-256-GCM encryption
// util landed in Phase 19b (OI-076).

import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __setMasterKeyForTests,
  decryptForTenant,
  decryptForTenantOrNull,
  deriveTenantKey,
  encryptForTenant,
  encryptForTenantOrNull,
} from "../encryption";

const FIXED_MASTER = Buffer.from(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "hex",
);

beforeEach(() => {
  __setMasterKeyForTests(FIXED_MASTER);
});

afterEach(() => {
  __setMasterKeyForTests(null);
});

describe("encryption — round-trip", () => {
  it("encrypt → decrypt returns the exact ASCII input", () => {
    const tenant = "tenant-aaa";
    const ct = encryptForTenant("hello world", tenant, 1);
    expect(decryptForTenant(ct, tenant)).toBe("hello world");
  });

  it("preserves multi-byte UTF-8 glyphs", () => {
    const tenant = "tenant-aaa";
    const input = "নমস্কার 👋 مرحبا — 12345";
    const ct = encryptForTenant(input, tenant, 1);
    expect(decryptForTenant(ct, tenant)).toBe(input);
  });

  it("uses a fresh IV per call — same plaintext yields different ciphertext", () => {
    const tenant = "tenant-aaa";
    const a = encryptForTenant("identical", tenant, 1);
    const b = encryptForTenant("identical", tenant, 1);
    expect(a).not.toBe(b);
    expect(decryptForTenant(a, tenant)).toBe("identical");
    expect(decryptForTenant(b, tenant)).toBe("identical");
  });
});

describe("encryption — tenant isolation", () => {
  it("ciphertext for tenant A cannot be decrypted with tenant B's key", () => {
    const ct = encryptForTenant("secret", "tenant-A", 1);
    expect(() => decryptForTenant(ct, "tenant-B")).toThrow();
  });

  it("derives a distinct key per (tenant, version)", () => {
    const k1 = deriveTenantKey("tenant-A", 1);
    const k2 = deriveTenantKey("tenant-A", 2);
    const kB = deriveTenantKey("tenant-B", 1);
    expect(k1.equals(k2)).toBe(false);
    expect(k1.equals(kB)).toBe(false);
  });
});

describe("encryption — key rotation", () => {
  it("ciphertext written with v1 still decrypts after rotating to v2", () => {
    const tenant = "tenant-A";
    const ctV1 = encryptForTenant("legacy", tenant, 1);
    // Now the same tenant rotates to version 2 — new writes embed
    // the v2 byte; old reads still pick the v1 derived key via
    // the embedded version byte.
    const ctV2 = encryptForTenant("fresh", tenant, 2);
    expect(decryptForTenant(ctV1, tenant)).toBe("legacy");
    expect(decryptForTenant(ctV2, tenant)).toBe("fresh");
  });
});

describe("encryption — tamper detection", () => {
  it("flipping a byte in the ciphertext throws on decrypt", () => {
    const tenant = "tenant-A";
    const ct = encryptForTenant("payload", tenant, 1);
    const buf = Buffer.from(ct, "base64url");
    // Flip a byte in the middle of the ciphertext segment
    // (after version + iv, before tag).
    const mid = Math.floor(buf.length / 2);
    buf[mid] = buf[mid]! ^ 0xff;
    const tampered = buf.toString("base64url");
    expect(() => decryptForTenant(tampered, tenant)).toThrow();
  });

  it("truncated input throws cleanly", () => {
    expect(() => decryptForTenant("AAAA", "tenant-A")).toThrow(/malformed/i);
  });
});

describe("encryption — nullable wrappers", () => {
  it("encryptForTenantOrNull returns null on null/undefined/empty", () => {
    expect(encryptForTenantOrNull(null, "tenant-A", 1)).toBeNull();
    expect(encryptForTenantOrNull(undefined, "tenant-A", 1)).toBeNull();
    expect(encryptForTenantOrNull("", "tenant-A", 1)).toBeNull();
  });

  it("decryptForTenantOrNull returns null on null/undefined", () => {
    expect(decryptForTenantOrNull(null, "tenant-A")).toBeNull();
    expect(decryptForTenantOrNull(undefined, "tenant-A")).toBeNull();
  });

  it("round-trip via nullable wrappers", () => {
    const ct = encryptForTenantOrNull("value", "tenant-A", 1);
    expect(ct).not.toBeNull();
    expect(decryptForTenantOrNull(ct, "tenant-A")).toBe("value");
  });
});

describe("encryption — input validation", () => {
  it("deriveTenantKey rejects empty tenantId", () => {
    expect(() => deriveTenantKey("", 1)).toThrow();
  });

  it("deriveTenantKey rejects out-of-range version", () => {
    expect(() => deriveTenantKey("tenant-A", 0)).toThrow();
    expect(() => deriveTenantKey("tenant-A", 256)).toThrow();
    expect(() => deriveTenantKey("tenant-A", 1.5)).toThrow();
  });

  it("throws if master key is missing", () => {
    __setMasterKeyForTests(null);
    const original = process.env.MASTER_ENCRYPTION_KEY;
    delete process.env.MASTER_ENCRYPTION_KEY;
    try {
      expect(() => deriveTenantKey("tenant-A", 1)).toThrow(/MASTER_ENCRYPTION_KEY/);
    } finally {
      if (original !== undefined) process.env.MASTER_ENCRYPTION_KEY = original;
    }
  });
});

describe("encryption — deterministic derivation under fixed inputs", () => {
  it("same (tenantId, version, master) yields the same derived key bytes", () => {
    const a = deriveTenantKey("tenant-stable", 7);
    const b = deriveTenantKey("tenant-stable", 7);
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(32);
  });

  it("changing the master key invalidates previously-derived keys", () => {
    const before = deriveTenantKey("tenant-A", 1);
    __setMasterKeyForTests(crypto.randomBytes(32));
    const after = deriveTenantKey("tenant-A", 1);
    expect(before.equals(after)).toBe(false);
  });
});
