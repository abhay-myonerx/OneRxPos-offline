import type { ReceiptJob, ReceiptLine } from "./hal.types";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const NUL = 0x00;

// CP850/CP858 byte values for common French/Latin-1 accented characters (the
// two code pages share these positions). Enables bilingual EN/FR receipts.
const CP850: Record<string, number> = {
  "ç": 0x87, "Ç": 0x80, "é": 0x82, "É": 0x90, "è": 0x8a, "È": 0xd4,
  "ê": 0x88, "ë": 0x89, "à": 0x85, "À": 0xb7, "â": 0x83, "ä": 0x84,
  "î": 0x8c, "ï": 0x8b, "ô": 0x93, "ö": 0x94, "ù": 0x97, "û": 0x96,
  "ü": 0x81, "°": 0xf8, "«": 0xae, "»": 0xaf,
};

// ESC t n code-page selector values (supported set).
const CODEPAGE_N: Record<string, number> = { cp850: 2, cp858: 19 };

type Encoder = (s: string) => number[];

/** Build a text encoder for a codepage (undefined/unsupported = ASCII-only). */
function makeEncoder(codepage?: string): Encoder {
  const table = codepage && CODEPAGE_N[codepage] !== undefined ? CP850 : undefined;
  return (s) => {
    const out: number[] = [];
    for (const ch of s) {
      const code = ch.codePointAt(0) ?? 0x3f;
      if (code <= 0x7f) out.push(code);
      else if (table && table[ch] !== undefined) out.push(table[ch]);
      else out.push(0x3f);
    }
    return out;
  };
}

const ALIGN: Record<NonNullable<ReceiptLine["align"]>, number> = { left: 0, center: 1, right: 2 };

function renderLine(line: ReceiptLine, encode: Encoder): number[] {
  const out: number[] = [];
  out.push(ESC, 0x61, ALIGN[line.align ?? "left"]); // ESC a n
  if (line.bold) out.push(ESC, 0x45, 0x01); // ESC E 1
  out.push(...encode(line.text), LF);
  if (line.bold) out.push(ESC, 0x45, 0x00); // ESC E 0
  return out;
}

/** Epson QR (GS ( k, model 2). Module size 3, error-correction level M. */
function qrCommands(data: string, encode: Encoder): number[] {
  const payload = encode(data);
  const storeLen = payload.length + 3;
  const pL = storeLen & 0xff;
  const pH = (storeLen >> 8) & 0xff;
  return [
    GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x03,
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
    GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...payload,
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
  ];
}

/**
 * Render a ReceiptJob to ESC/POS bytes. Pure — reused by every transport.
 * `opts.codepage` (cp850|cp858) selects a code page + encodes French accents;
 * omitted = ASCII-only.
 */
export function renderReceipt(job: ReceiptJob, opts: { codepage?: string } = {}): Uint8Array {
  const out: number[] = [];
  const encode = makeEncoder(opts.codepage);
  out.push(ESC, 0x40); // ESC @ initialize
  const n = opts.codepage ? CODEPAGE_N[opts.codepage] : undefined;
  if (n !== undefined) out.push(ESC, 0x74, n); // ESC t n — select code page
  if (job.logo) {
    const { width, height, data } = job.logo;
    // GS v 0 m xL xH yL yH data — raster bit image
    out.push(GS, 0x76, 0x30, 0x00, width & 0xff, (width >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff, ...data);
  }
  for (const l of job.header ?? []) out.push(...renderLine(l, encode));
  for (const l of job.lines) out.push(...renderLine(l, encode));
  if (job.barcode) out.push(GS, 0x6b, 0x04, ...encode(job.barcode), NUL);
  if (job.qr) out.push(...qrCommands(job.qr, encode));
  if (job.openDrawer) out.push(ESC, 0x70, 0x00, 0x19, 0xfa);
  if (job.cut) out.push(GS, 0x56, 0x00);
  return Uint8Array.from(out);
}
