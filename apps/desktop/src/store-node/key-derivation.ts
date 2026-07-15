import {
  pbkdf2Sync,
} from "node:crypto";

const ITERATIONS = 210_000;

const KEY_BYTES = 32;

const DIGEST = "sha256";

/**
 * Derives the RX POS local SQLCipher key.
 *
 * IMPORTANT:
 *
 * This contract must remain compatible with:
 *
 * apps/backend/src/local/key-derivation.ts
 *
 * Contract:
 *
 *   PBKDF2-SHA256
 *   master key = installation-local secret
 *   salt       = RX POS device fingerprint
 *   iterations = 210,000
 *   key length = 32 bytes
 *
 * The derived key is never persisted.
 */
export function deriveStoreNodeLocalDbKey(
  masterKey: string,
  deviceId: string,
): Buffer {
  const normalizedMasterKey =
    masterKey.trim();

  const normalizedDeviceId =
    deviceId.trim();

  if (!normalizedMasterKey) {
    throw new Error(
      "deriveStoreNodeLocalDbKey: masterKey is required",
    );
  }

  if (!normalizedDeviceId) {
    throw new Error(
      "deriveStoreNodeLocalDbKey: deviceId is required",
    );
  }

  return pbkdf2Sync(
    normalizedMasterKey,
    normalizedDeviceId,
    ITERATIONS,
    KEY_BYTES,
    DIGEST,
  );
}