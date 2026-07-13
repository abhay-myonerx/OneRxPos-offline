import type { WeightReading } from "./hal.types";

// Order matters: "kg" before "g" so the two-letter unit wins.
const UNIT_RE = /(kg|lb|oz|g)/i;
const NUMBER_RE = /-?\d+(\.\d+)?/;

/**
 * Replace control characters (code point < 0x20: STX/ETX/CR/LF/…) with spaces
 * so tokens stay separated. The minus sign (0x2D) is left intact. Written as a
 * code-point scan rather than a regex so the source stays plain ASCII.
 */
function stripControl(s: string): string {
  let out = "";
  for (const ch of s) {
    out += ch.charCodeAt(0) < 0x20 ? " " : ch;
  }
  return out;
}

/**
 * Parse the ASCII weight frame emitted by NCI-compatible serial/network scales
 * in polled mode. Accepts `[sign]<number><unit>[status]` with surrounding
 * control bytes / spaces tolerated (e.g. "  1.245kg S", "-0.5lbM"). A trailing
 * 'M'/'m' after the unit => in motion (stable:false); 'S'/'s' or nothing =>
 * stable. Returns null when the frame carries no numeric weight + unit.
 */
export function parseScaleWeight(frame: string): WeightReading | null {
  const clean = stripControl(frame).trim();

  const unitMatch = clean.match(UNIT_RE);
  if (!unitMatch || unitMatch.index === undefined) return null;

  const numMatch = clean.match(NUMBER_RE);
  if (!numMatch) return null;
  const value = parseFloat(numMatch[0]);
  if (Number.isNaN(value)) return null;

  const unit = unitMatch[1].toLowerCase() as WeightReading["unit"];
  const afterUnit = clean.slice(unitMatch.index + unitMatch[1].length);
  const stable = !/m/i.test(afterUnit);

  return { value, unit, stable };
}
