import type { ReceiptJob, ReceiptLine } from "./hal.types";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const STAR_ALIGN: Record<NonNullable<ReceiptLine["align"]>, number> = { left: 0, center: 1, right: 2 };

function encodeAscii(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0x3f;
    out.push(c > 0x7f ? 0x3f : c);
  }
  return out;
}

function starLine(line: ReceiptLine): number[] {
  const out: number[] = [];
  out.push(ESC, GS, 0x61, STAR_ALIGN[line.align ?? "left"]); // ESC GS a n (Star alignment)
  if (line.bold) out.push(ESC, 0x45); // ESC E — Star emphasis ON (no arg, unlike ESC/POS)
  out.push(...encodeAscii(line.text), LF);
  if (line.bold) out.push(ESC, 0x46); // ESC F — Star emphasis OFF
  return out;
}

/**
 * Render a ReceiptJob in STAR Line Mode. Star is NOT ESC/POS — its alignment
 * (ESC GS a), emphasis (ESC E/F), cut (ESC d), and drawer (ESC BEL) commands all
 * differ from Epson. (Star barcode/QR/code-page are model-specific — deferred.)
 */
export function renderStarReceipt(job: ReceiptJob): Uint8Array {
  const out: number[] = [];
  out.push(ESC, 0x40); // initialize
  for (const l of job.header ?? []) out.push(...starLine(l));
  for (const l of job.lines) out.push(...starLine(l));
  if (job.openDrawer) out.push(ESC, 0x07, 0x0b, 0x37, 0x05); // ESC BEL — Star drawer kick
  if (job.cut) out.push(ESC, 0x64, 0x02); // ESC d 2 — Star full cut
  return Uint8Array.from(out);
}
