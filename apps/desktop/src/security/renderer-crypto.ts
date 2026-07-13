// src/security/renderer-crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV = 12;
const TAG = 16;

export function keyFromEnv(hex: string): Buffer {
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("RENDERER_ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
  return key;
}

export function encryptRenderer(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, ct, cipher.getAuthTag()]);
}

export function decryptRenderer(wire: Buffer, key: Buffer): Buffer {
  if (wire.length < IV + TAG) throw new Error("renderer ciphertext too short");
  const iv = wire.subarray(0, IV);
  const tag = wire.subarray(wire.length - TAG);
  const ct = wire.subarray(IV, wire.length - TAG);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
