import { createHash } from "node:crypto";

// Crockford Base32 minus ambiguous I L O U.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const GROUP = /^[0-9A-HJKMNP-TV-Z]{5}$/;

function toBase32(bytes: Buffer, len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i % bytes.length] % 32];
  return out;
}

// Deterministic 5-char checksum over the first three groups.
export function computeChecksumGroup(firstThree: string[]): string {
  const h = createHash("sha256").update(firstThree.join("-")).digest();
  return toBase32(h, 5);
}

export function parseLicenseKey(key: string): { groups: string[] } | null {
  const groups = key.split("-");
  if (groups.length !== 4 || !groups.every((g) => GROUP.test(g))) return null;
  return { groups };
}

export function isValidLicenseKey(key: string): boolean {
  const parsed = parseLicenseKey(key);
  if (!parsed) return false;
  const [a, b, c, checksum] = parsed.groups;
  return checksum === computeChecksumGroup([a, b, c]);
}

// Dev/seed helper (mirrors sync's mintSyncToken): derive 3 payload groups from
// a seed, then append the matching checksum group -> a valid key.
export function mintLicenseKey(seed: string): string {
  const h = createHash("sha256").update(seed).digest();
  const g = (n: number) => toBase32(h.subarray(n * 5, n * 5 + 5), 5);
  const first = [g(0), g(1), g(2)];
  return [...first, computeChecksumGroup(first)].join("-");
}
