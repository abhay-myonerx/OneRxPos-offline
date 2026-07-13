import { pbkdf2Sync } from "node:crypto";

const ITERATIONS = 210_000; // OWASP-ish PBKDF2-SHA256 floor
const KEY_BYTES = 32; // AES-256

// Derive the SQLCipher / event key from the master secret + device id (salt).
// Spec §7.2: PBKDF2, device id + credential; never stored plaintext.
export function deriveLocalDbKey(masterKey: string, deviceId: string): Buffer {
  if (!masterKey) throw new Error("deriveLocalDbKey: masterKey required");
  if (!deviceId) throw new Error("deriveLocalDbKey: deviceId required");
  return pbkdf2Sync(masterKey, deviceId, ITERATIONS, KEY_BYTES, "sha256");
}

export function keyToHex(key: Buffer): string {
  return key.toString("hex");
}
