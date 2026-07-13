// Per-tenant AES-256-GCM encryption with HKDF-SHA256 key derivation.
//
// Background:
//   The v2 HRM modules need to encrypt sensitive PII (nationalId,
//   passport, taxId, bankDetails, salary, 2FA secret). Per-tenant
//   keys are derived from a single platform-level master key so the
//   master can be rotated without re-keying every tenant, and a
//   tenant's key can be rotated independently by bumping
//   `Tenant.encryptionKeyVersion`.
//
// Crypto contract:
//   - Master key:           32 bytes (from MASTER_ENCRYPTION_KEY env)
//   - HKDF salt:            32 bytes (per-tenant deterministic)
//   - HKDF info:            "rxpos/v2/<tenantId>/<version>"
//                           (decrypt also accepts the legacy
//                           "posvelo/v2/..." brand for ciphertext
//                           written before the POSVelo→RX POS rename)
//   - Derived key:          32 bytes (AES-256)
//   - AES mode:             GCM (authenticated)
//   - IV:                   12 bytes random per encryption
//   - Tag:                  16 bytes (GCM standard)
//   - Wire format:          base64url(version|iv|ciphertext|tag)
//                           version is 1 byte (uint8) prefix so the
//                           decrypt path can pick the right derived
//                           key without an external lookup.
//
// Invariants:
//   1. Decrypting ciphertext written for tenant A with tenant B's key
//      throws — verified by a regression test.
//   2. Tampering with any byte of the wire format throws an
//      auth-tag verification error — verified by a regression test.
//   3. A round-trip encrypt → decrypt always returns the exact input
//      bytes, including UTF-8 strings with multi-byte glyphs.
//   4. Key rotation is forward-compatible: encrypting with v2 writes
//      the v2 byte prefix; decrypting will still work for ciphertext
//      written with v1 as long as the caller passes the v1 derivation
//      via `encryptionKeyVersion`. Out-of-scope: the actual rotation
//      endpoint (deferred until needed).
//
// What this file does NOT do:
//   - It does not look up `Tenant.encryptionKeyVersion` from the DB.
//     The caller must pass it. This keeps the util pure / testable
//     and avoids creating a circular import with the prisma client.
//   - It does not provide a blind index for SQL-side aggregation
//     (OI-011 — deferred). Salary band searches will need a separate
//     HMAC-SHA256 column once the requirement firms up.

import crypto from "crypto";

// ── Constants ────────────────────────────────────────────────────────

const MASTER_KEY_BYTES = 32;
const DERIVED_KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard
const TAG_BYTES = 16;
const VERSION_PREFIX_BYTES = 1; // uint8 — supports up to 255 rotations

const HKDF_BRAND = "rxpos";
// backward-compat: decrypt still accepts pre-rename ciphertext. Exported
// (test-only use) so the regression test can reference the exact legacy
// brand value without hard-coding the literal string itself.
export const LEGACY_HKDF_BRAND = "posvelo";

// HKDF salt is per-tenant deterministic. We use SHA-256(tenantId) as
// a stable 32-byte salt; this gives every tenant a distinct salt
// without storing one. Versioning is in the `info` parameter so a
// rotation produces a different derived key without changing the salt.
function tenantSalt(tenantId: string): Buffer {
  return crypto.createHash("sha256").update(tenantId, "utf8").digest();
}

function hkdfInfo(tenantId: string, version: number, brand: string): Buffer {
  return Buffer.from(`${brand}/v2/${tenantId}/${version}`, "utf8");
}

// ── Master key handling ─────────────────────────────────────────────

let cachedMasterKey: Buffer | null = null;

/**
 * Resolves the master encryption key from `MASTER_ENCRYPTION_KEY` env.
 * The value MUST be 64 hex chars OR a 44-char base64-encoded 32-byte
 * blob. Throws at first use if missing/malformed (fail-closed).
 *
 * Cached after first read so we don't re-parse the env var on every
 * crypto operation.
 *
 * Test boundary: tests bypass the env by calling `__setMasterKeyForTests`.
 */
function getMasterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;
  const raw = process.env.MASTER_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("MASTER_ENCRYPTION_KEY env var is not set — required for v2 HRM encryption");
  }
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    buf = Buffer.from(raw, "hex");
  } else {
    try {
      buf = Buffer.from(raw, "base64");
    } catch {
      throw new Error("MASTER_ENCRYPTION_KEY must be 64 hex chars or base64-encoded 32 bytes");
    }
  }
  if (buf.length !== MASTER_KEY_BYTES) {
    throw new Error(
      `MASTER_ENCRYPTION_KEY must decode to ${MASTER_KEY_BYTES} bytes (got ${buf.length})`,
    );
  }
  cachedMasterKey = buf;
  return buf;
}

/**
 * Test-only injector. Production code MUST NOT call this. Reaches into
 * the cache so tests can run without env setup.
 */
export function __setMasterKeyForTests(key: Buffer | null): void {
  if (key !== null && key.length !== MASTER_KEY_BYTES) {
    throw new Error(`Test master key must be ${MASTER_KEY_BYTES} bytes`);
  }
  cachedMasterKey = key;
}

// ── Key derivation ──────────────────────────────────────────────────

/**
 * Derives the AES-256 key for `(tenantId, version)` via HKDF-SHA256.
 * Pure function — same inputs always yield the same output. Used by
 * both the encrypt and decrypt paths.
 *
 * Synchronous (uses node:crypto.hkdfSync); the work is small (<1ms)
 * so we don't need the async variant.
 */
export function deriveTenantKey(tenantId: string, version: number, brand: string = HKDF_BRAND): Buffer {
  if (!tenantId || typeof tenantId !== "string") {
    throw new Error("deriveTenantKey: tenantId required");
  }
  if (!Number.isInteger(version) || version < 1 || version > 255) {
    throw new Error("deriveTenantKey: version must be 1..255");
  }
  const out = crypto.hkdfSync(
    "sha256",
    getMasterKey(),
    tenantSalt(tenantId),
    hkdfInfo(tenantId, version, brand),
    DERIVED_KEY_BYTES,
  );
  // `hkdfSync` returns ArrayBuffer in some node versions; normalize.
  return Buffer.from(out);
}

// ── Wire format ─────────────────────────────────────────────────────

/**
 * Encrypts UTF-8 plaintext for the given tenant + key version.
 * Returns a base64url string ready to store in a `*Enc String? @db.Text`
 * Prisma column. The version byte is embedded as the first byte so
 * the decrypt path can pick the right derived key even after rotation.
 */
export function encryptForTenant(plaintext: string, tenantId: string, version: number): string {
  const key = deriveTenantKey(tenantId, version);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const versionByte = Buffer.from([version]);
  return Buffer.concat([versionByte, iv, ct, tag]).toString("base64url");
}

/**
 * Decrypts a ciphertext produced by `encryptForTenant` for the same
 * tenantId. Throws if:
 *   - the input is malformed
 *   - the version byte points to a derived key that doesn't decrypt
 *   - the tag fails verification (tampering / wrong tenant)
 */
export function decryptForTenant(ciphertextB64Url: string, tenantId: string): string {
  if (!ciphertextB64Url || typeof ciphertextB64Url !== "string") {
    throw new Error("decryptForTenant: ciphertext required");
  }
  const buf = Buffer.from(ciphertextB64Url, "base64url");
  if (buf.length < VERSION_PREFIX_BYTES + IV_BYTES + TAG_BYTES) {
    throw new Error("decryptForTenant: ciphertext truncated or malformed");
  }
  const version = buf.readUInt8(0);
  const iv = buf.subarray(VERSION_PREFIX_BYTES, VERSION_PREFIX_BYTES + IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ct = buf.subarray(VERSION_PREFIX_BYTES + IV_BYTES, buf.length - TAG_BYTES);

  const attempt = (brand: string): string => {
    const key = deriveTenantKey(tenantId, version, brand);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  };

  try {
    return attempt(HKDF_BRAND);
  } catch (errNew) {
    try {
      return attempt(LEGACY_HKDF_BRAND);
    } catch {
      throw errNew; // surface the new-brand error; a wrong/tampered token fails both
    }
  }
}

// ── Convenience nullable wrappers ───────────────────────────────────

/**
 * Returns null for null/undefined input — convenient for nullable
 * `*Enc` columns where we want NULL when the operator didn't supply
 * a value rather than encrypting an empty string.
 */
export function encryptForTenantOrNull(
  plaintext: string | null | undefined,
  tenantId: string,
  version: number,
): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") {
    return null;
  }
  return encryptForTenant(plaintext, tenantId, version);
}

export function decryptForTenantOrNull(
  ciphertext: string | null | undefined,
  tenantId: string,
): string | null {
  if (ciphertext === null || ciphertext === undefined) return null;
  return decryptForTenant(ciphertext, tenantId);
}
