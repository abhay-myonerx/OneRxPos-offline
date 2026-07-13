import type { BarcodeFormat, DecodeResult } from "../types";

/**
 * Plain product barcode adapter (Phase 1.3c). Recognises retail symbologies —
 * UPC-A, UPC-E, EAN-8, EAN-13 — validates the mod-10 check digit, and expands
 * UPC-E to its canonical UPC-A form for lookup. It is also the low-confidence
 * catch-all: any other non-empty string is passed through as a product code so
 * that today's "scan → lookupByBarcode" behaviour is preserved for codes the
 * other adapters don't claim (the backend returns 404 if unknown).
 */

const DIGITS = /^\d+$/;

/** Standard GTIN mod-10 check-digit validation (EAN-8/13, UPC-A). */
export function gtinChecksumValid(code: string): boolean {
  if (!DIGITS.test(code) || code.length < 2) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop() as number;
  let sum = 0;
  let weight = 3;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += digits[i] * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Expand an 8-digit UPC-E (number-system + 6 + check) to its 12-digit UPC-A.
 * Returns null if the input isn't a well-formed UPC-E. The check digit is
 * carried through from the UPC-E (it equals the UPC-A check digit).
 */
export function expandUpcE(upce: string): string | null {
  if (!DIGITS.test(upce) || upce.length !== 8) return null;
  const ns = upce[0];
  if (ns !== "0" && ns !== "1") return null;
  const s = upce.slice(1, 7).split(""); // s0..s5
  const check = upce[7];
  const last = s[5];
  let manufacturer: string;
  let product: string;
  if (last === "0" || last === "1" || last === "2") {
    manufacturer = s[0] + s[1] + last + "00";
    product = "00" + s[2] + s[3] + s[4];
  } else if (last === "3") {
    manufacturer = s[0] + s[1] + s[2] + "00";
    product = "000" + s[3] + s[4];
  } else if (last === "4") {
    manufacturer = s[0] + s[1] + s[2] + s[3] + "0";
    product = "0000" + s[4];
  } else {
    manufacturer = s[0] + s[1] + s[2] + s[3] + s[4];
    product = "0000" + last;
  }
  return ns + manufacturer + product + check;
}

/** True for a numeric string of a valid retail length with a good check digit. */
function isValidRetailCode(raw: string): boolean {
  if (!DIGITS.test(raw)) return false;
  if (raw.length === 8 && (raw[0] === "0" || raw[0] === "1")) {
    // Could be UPC-E; validate via its expansion.
    const expanded = expandUpcE(raw);
    if (expanded && gtinChecksumValid(expanded)) return true;
  }
  if (raw.length === 8 || raw.length === 12 || raw.length === 13) {
    return gtinChecksumValid(raw);
  }
  return false;
}

export const productAdapter: BarcodeFormat = {
  id: "product",

  match(raw: string): number {
    const code = raw.trim();
    if (code.length === 0) return 0;
    // A checksum-valid retail code is a confident product match; anything else
    // is a weak catch-all (still worth a lookup, but any real template/GS1
    // match outranks it).
    return isValidRetailCode(code) ? 0.6 : 0.2;
  },

  decode(raw: string): DecodeResult {
    const code = raw.trim();
    // Normalise a valid 8-digit UPC-E to UPC-A so lookup matches the canonical
    // stored barcode; otherwise pass the scanned code through unchanged.
    let lookupCode = code;
    if (code.length === 8 && (code[0] === "0" || code[0] === "1")) {
      const expanded = expandUpcE(code);
      if (expanded && gtinChecksumValid(expanded)) lookupCode = expanded;
    }
    return {
      kind: "product",
      code: lookupCode,
      confidence: isValidRetailCode(code) ? 0.6 : 0.2,
      source: "product",
    };
  },
};
