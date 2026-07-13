import type {
  BarcodeFormat,
  BarcodeTemplate,
  DecodeContext,
  DecodedFields,
  DecodeResult,
  TemplateField,
} from "../types";

/**
 * Config-driven template adapter (Phase 1.3c) — the "learn a label" runtime.
 * Matches a tenant's learned `BarcodeTemplate`s (Rx / vendor labels) and carves
 * out fields (Rx#, price, patient, batch, …) with no per-vendor code. Templates
 * are the most specific match, so they outrank GS1 / product.
 *
 * Safety: if a template declares a `price` field but extraction fails, the
 * decode downgrades to `unknown` (→ manual entry) rather than emit a priced
 * result it isn't sure about.
 */

const TEMPLATE_CONFIDENCE = 0.95;

function templateMatches(raw: string, t: BarcodeTemplate): boolean {
  if (!t.isActive) return false;
  switch (t.matchType) {
    case "prefix":
      return raw.startsWith(t.matchValue);
    case "length":
      return raw.length === Number(t.matchValue);
    case "regex":
      try {
        return new RegExp(t.matchValue).test(raw);
      } catch {
        return false;
      }
  }
}

function firstMatch(raw: string, ctx: DecodeContext): BarcodeTemplate | undefined {
  return ctx.templates.find((t) => templateMatches(raw, t));
}

/** Extract a single field's raw text per the template strategy. */
function extractRaw(raw: string, field: TemplateField, t: BarcodeTemplate): string | undefined {
  switch (t.strategy) {
    case "delimited": {
      const delim = t.config.delimiter ?? "|";
      const parts = raw.split(delim);
      return field.index != null ? parts[field.index]?.trim() : undefined;
    }
    case "fixed": {
      if (field.start == null || field.length == null) return undefined;
      const slice = raw.substr(field.start, field.length).trim();
      return slice.length > 0 ? slice : undefined;
    }
    case "regex": {
      if (!t.config.pattern || !field.group) return undefined;
      try {
        const m = raw.match(new RegExp(t.config.pattern));
        return m?.groups?.[field.group]?.trim();
      } catch {
        return undefined;
      }
    }
  }
}

/** Parse a price string: honour an embedded decimal, else apply implied decimals. */
export function parseTemplatePrice(text: string, decimals: number | undefined): number | undefined {
  const cleaned = text.replace(/[^0-9.,]/g, "");
  if (cleaned === "") return undefined;
  if (/[.,]/.test(cleaned)) {
    const n = parseFloat(cleaned.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return undefined;
  return n / 10 ** (decimals ?? 0);
}

export const templateAdapter: BarcodeFormat = {
  id: "template",

  match(raw: string, ctx: DecodeContext): number {
    return firstMatch(raw, ctx) ? TEMPLATE_CONFIDENCE : 0;
  },

  decode(raw: string, ctx: DecodeContext): DecodeResult {
    const t = firstMatch(raw, ctx);
    if (!t) return { kind: "unknown", raw, confidence: 0, source: "template" };

    const fields: DecodedFields = {};
    let pricePromisedButMissing = false;

    for (const f of t.config.fields) {
      const text = extractRaw(raw, f, t);
      if (f.kind === "price") {
        const price = text != null ? parseTemplatePrice(text, t.config.priceDecimals) : undefined;
        if (price == null) pricePromisedButMissing = true;
        else fields.price = price;
      } else if (text != null) {
        if (f.kind === "text") {
          (fields.text ??= {})[f.name] = text;
        } else {
          fields[f.kind] = text;
        }
      }
    }

    // Never emit a priced Rx result we couldn't actually read the price from.
    if (pricePromisedButMissing) {
      return { kind: "unknown", raw, confidence: 0, source: "template" };
    }

    return {
      kind: "rx",
      templateId: t.id,
      fields,
      taxCategory: t.config.taxCategory,
      confidence: TEMPLATE_CONFIDENCE,
      source: "template",
    };
  },
};
