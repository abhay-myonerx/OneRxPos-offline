import type { BarcodeFormat, DecodeContext, DecodeResult } from "../types";

/**
 * GS1 adapter (Phase 1.3c). Parses GS1 element strings (Application
 * Identifiers) into GTIN + embedded price/weight/batch/expiry. Segments
 * variable-length AIs using the standard AI-length table so it works even when
 * keyboard-wedge scanners strip the FNC1/GS separator; when a GS (ASCII 29)
 * separator IS present it is honoured.
 *
 * Covered AIs: 01 GTIN(14) · 10 batch(var) · 17 expiry YYMMDD(6) · 21 serial(var)
 * · 310n net weight kg(6, n=decimals) · 390n/391n/392n/393n amount/price(var,
 * n=decimals) · 8005 price-per-unit(6) · 8112 coupon(var).
 */

const GS = "\x1d"; // FNC1 / group separator

const FIXED_2: Record<string, number> = {
  "00": 18, "01": 14, "02": 14, "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6, "20": 2,
};
const VAR_2 = new Set(["10", "21", "22", "30", "37", "90", "91", "92", "93", "94", "95", "96", "97", "98", "99"]);

interface AiSpec {
  ai: string;
  aiLen: number;
  /** null = variable length (read to GS or end). */
  dataLen: number | null;
}

/** Identify the AI at position `i` and how long its data is. Returns null if unrecognised. */
function readAi(s: string, i: number): AiSpec | null {
  const c3 = s.substr(i, 3);
  // 4-char AIs: amounts/prices 390n–393n (variable), measures 31nn–36nn (6-digit).
  if (/^39[0-3]$/.test(c3)) return { ai: s.substr(i, 4), aiLen: 4, dataLen: null };
  if (/^3[1-6]\d$/.test(c3)) return { ai: s.substr(i, 4), aiLen: 4, dataLen: 6 };
  const c4 = s.substr(i, 4);
  if (c4 === "8005") return { ai: "8005", aiLen: 4, dataLen: 6 };
  if (c4 === "8112") return { ai: "8112", aiLen: 4, dataLen: null };
  const c2 = s.substr(i, 2);
  if (c2 in FIXED_2) return { ai: c2, aiLen: 2, dataLen: FIXED_2[c2] };
  if (VAR_2.has(c2)) return { ai: c2, aiLen: 2, dataLen: null };
  return null;
}

/** Parse a concatenated GS1 element string into an AI→value map. Stops at the first unparseable AI. */
export function parseGs1(raw: string): Record<string, string> {
  const s = raw;
  const ais: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    const spec = readAi(s, i);
    if (!spec) break;
    i += spec.aiLen;
    let value: string;
    if (spec.dataLen != null) {
      value = s.substr(i, spec.dataLen);
      i += spec.dataLen;
    } else {
      const gs = s.indexOf(GS, i);
      if (gs === -1) {
        value = s.slice(i);
        i = s.length;
      } else {
        value = s.slice(i, gs);
        i = gs + 1;
      }
    }
    ais[spec.ai] = value;
    // A trailing GS immediately after fixed-length data is allowed; skip it.
    if (s[i] === GS) i += 1;
  }
  return ais;
}

function findKey(ais: Record<string, string>, re: RegExp): string | undefined {
  return Object.keys(ais).find((k) => re.test(k));
}

function extractWeightKg(ais: Record<string, string>): number | undefined {
  const key = findKey(ais, /^310\d$/); // 310n = net weight (kg)
  if (!key) return undefined;
  const decimals = Number(key[3]);
  const v = Number(ais[key]);
  return Number.isFinite(v) ? v / 10 ** decimals : undefined;
}

function extractPrice(ais: Record<string, string>): number | undefined {
  // 392n = amount payable (single monetary area); 393n = with 3-digit ISO currency prefix.
  // 390n/391n = amount payable (older); treat the same. (Key is 4 chars: 39x + decimals.)
  const key = findKey(ais, /^39[0-3]\d$/);
  if (!key) return undefined;
  const decimals = Number(key[3]);
  let raw = ais[key];
  if (key[2] === "1" || key[2] === "3") raw = raw.slice(3); // strip ISO currency (391n/393n)
  const v = Number(raw);
  return Number.isFinite(v) ? v / 10 ** decimals : undefined;
}

function stripSymbology(raw: string): string {
  // A leading AIM symbology identifier (e.g. "]C1", "]e0") is metadata, not data.
  return raw.replace(/^\][A-Za-z]\d/, "");
}

function looksGs1(raw: string): number {
  const s = stripSymbology(raw);
  if (/^01\d{14}/.test(s)) return 0.85; // GTIN AI with a full 14-digit payload
  if (/^(39[0-3]|3[1-6]\d)/.test(s)) return 0.7; // leads with a price/measure AI
  return 0;
}

export const gs1Adapter: BarcodeFormat = {
  id: "gs1",

  match(raw: string, ctx: DecodeContext): number {
    if (ctx.symbology && /\]C1|\]e0|\]d2|\]Q3/.test(ctx.symbology)) return 0.9;
    return looksGs1(raw);
  },

  decode(raw: string): DecodeResult {
    const s = stripSymbology(raw);
    const ais = parseGs1(s);
    const gtin = ais["01"];
    const price = extractPrice(ais);
    const weightKg = extractWeightKg(ais);
    const batch = ais["10"];
    const expiry = ais["17"];

    // A GS1 coupon (8112) is parsed but not applied in 1.3c.
    if (ais["8112"] && !gtin) {
      return { kind: "coupon", raw, ais, confidence: 0.7, source: "gs1" };
    }

    return {
      kind: "gs1",
      // Keep the GTIN lossless (14-digit AI value); the ring-up lookup
      // normalises (tries the GTIN and leading-zero-stripped variants).
      gtin: gtin || undefined,
      price,
      weightKg,
      batch,
      expiry,
      ais,
      confidence: looksGs1(raw) || 0.7,
      source: "gs1",
    };
  },
};
