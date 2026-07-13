import type { BarcodeFormat, DecodeContext, DecodeResult } from "./types";
import { BUILT_IN_ADAPTERS } from "./registry";

/** Below this confidence a scan is treated as unreadable → manual entry. */
const MIN_CONFIDENCE = 0.15;

/**
 * Decode a raw scan into a structured `DecodeResult` (Phase 1.3c). Pure: the
 * tenant's templates + optional symbology come in via `ctx`. Runs every adapter's
 * cheap `match()` probe, decodes with the highest-confidence one, and falls back
 * to `unknown` (→ manual entry) when nothing is confident enough.
 */
export function decodeBarcode(
  raw: string,
  ctx: DecodeContext,
  adapters: BarcodeFormat[] = BUILT_IN_ADAPTERS,
): DecodeResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: "unknown", raw, confidence: 0, source: "none" };

  let best: { adapter: BarcodeFormat; score: number } | null = null;
  for (const a of adapters) {
    const score = a.match(trimmed, ctx);
    if (score > 0 && (!best || score > best.score)) best = { adapter: a, score };
  }

  if (!best || best.score < MIN_CONFIDENCE) {
    return { kind: "unknown", raw, confidence: best?.score ?? 0, source: best?.adapter.id ?? "none" };
  }
  return best.adapter.decode(trimmed, ctx);
}
