import crypto from "crypto";
import { hashPassword, verifyPassword } from "@/shared/utils/password";
import { config } from "@/config";

function pepper(pin: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(pin, "utf8").digest("hex");
}

export async function hashPin(pin: string): Promise<string> {
  return hashPassword(pepper(pin, config.PIN_PEPPER_SECRET));
}

// Verify against the current pepper, then the previous (rotation-tolerant).
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (await verifyPassword(hash, pepper(pin, config.PIN_PEPPER_SECRET))) return true;
  if (config.PIN_PEPPER_SECRET_PREVIOUS) {
    return verifyPassword(hash, pepper(pin, config.PIN_PEPPER_SECRET_PREVIOUS));
  }
  return false;
}

// Reject trivially guessable PINs: non-6-digit, all-same, straight ascending/descending runs.
export function isWeakPin(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return true;
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const asc = "0123456789", desc = "9876543210";
  return asc.includes(pin) || desc.includes(pin);
}
