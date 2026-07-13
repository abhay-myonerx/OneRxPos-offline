import type { TaxCategory } from "rx-pos-shared";

/**
 * Barcode Layer 2 — semantic decode types (Phase 1.3c).
 *
 * Layer 1 (useBarcodeScanner / useSocketScanner) yields a raw string; Layer 2
 * turns it into a structured `DecodeResult` the ring-up flow can route on. The
 * pipeline is pure — templates are passed in via `DecodeContext`.
 */

/** Semantic meaning a template field carries once extracted. */
export type FieldKind =
  | "rxNumber"
  | "price"
  | "patient"
  | "batch"
  | "expiry"
  | "gtin"
  | "text";

/** Parsed fields from a config-driven (Rx/vendor) label. */
export interface DecodedFields {
  rxNumber?: string;
  price?: number;
  patient?: string;
  batch?: string;
  expiry?: string;
  gtin?: string;
  /** Any additional `text` fields, keyed by their template field name. */
  text?: Record<string, string>;
}

/**
 * The result of decoding a raw scan. A discriminated union so the ring-up
 * router can act per kind. Every variant carries a `confidence` (0–1) and the
 * `source` adapter id.
 */
export type DecodeResult =
  | { kind: "product"; code: string; confidence: number; source: string }
  | {
      kind: "gs1";
      gtin?: string;
      /** Embedded price in dollars (from AI 392x/393x), if present. */
      price?: number;
      /** Embedded net weight in kg (from AI 310x), if present. */
      weightKg?: number;
      batch?: string;
      /** Expiry as YYMMDD (AI 17), if present. */
      expiry?: string;
      ais: Record<string, string>;
      confidence: number;
      source: string;
    }
  | {
      kind: "rx";
      templateId: string;
      fields: DecodedFields;
      taxCategory?: TaxCategory;
      confidence: number;
      source: string;
    }
  | { kind: "coupon"; raw: string; ais: Record<string, string>; confidence: number; source: string }
  | { kind: "unknown"; raw: string; confidence: number; source: string };

// ── Config-driven templates (mirror the backend BarcodeTemplate) ─────────────

export type MatchType = "prefix" | "regex" | "length";
export type Strategy = "delimited" | "fixed" | "regex";

export interface TemplateField {
  /** Unique field name within the template. */
  name: string;
  kind: FieldKind;
  /** delimited: 0-based index into the split parts. */
  index?: number;
  /** fixed: substring start (0-based) + length. */
  start?: number;
  length?: number;
  /** regex: named capture group. */
  group?: string;
}

export interface TemplateConfig {
  fields: TemplateField[];
  /** Implied decimal places for a `price` field (e.g. "1240" + 2 → 12.40). */
  priceDecimals?: number;
  /** Tax treatment for the line rung from this label. */
  taxCategory?: TaxCategory;
  /** delimited strategy: the split character. */
  delimiter?: string;
  /** regex strategy: the pattern (with named groups matching field.group). */
  pattern?: string;
}

export interface BarcodeTemplate {
  id: string;
  name: string;
  matchType: MatchType;
  matchValue: string;
  strategy: Strategy;
  config: TemplateConfig;
  isActive: boolean;
}

export interface DecodeContext {
  /** AIM symbology identifier if the scanner provided one (e.g. "]C1"). */
  symbology?: string;
  /** The tenant's learned templates (fetched once, passed in — keeps decode pure). */
  templates: BarcodeTemplate[];
}

/**
 * A decode adapter. `match` is a cheap confidence probe (0 = not my format);
 * `decode` does the real parsing and may downgrade to `unknown` on validation
 * failure (safety — never emit a priced result it isn't sure about).
 */
export interface BarcodeFormat {
  id: string;
  match(raw: string, ctx: DecodeContext): number;
  decode(raw: string, ctx: DecodeContext): DecodeResult;
}
