// ZPL prescription-label renderer (Phase 2.10.3). ZPL is a text protocol, so
// this returns a string. PII-FREE — carries drug/DIN/Rx#/directions/warnings +
// an optional barcode reference, never a patient identity.

export interface RxLabel {
  drugName: string;
  din?: string;
  rxNumber?: string;
  directions?: string;
  warnings?: string[];
  barcode?: string; // e.g. DIN or Rx# — a reference, not PII
}

/** Neutralize ZPL control chars (^ ~) in caller-supplied field data. */
function zplField(text: string): string {
  return text.replace(/[\^~]/g, " ");
}

/**
 * Render an Rx label to ZPL for a Zebra label printer. Fields are laid out
 * top-to-bottom; a Code128 barcode (^BC) is appended when provided.
 */
export function renderRxLabelZpl(label: RxLabel): string {
  const lines: string[] = ["^XA"];
  let y = 30;
  const field = (text: string, size = 30): void => {
    lines.push(`^FO40,${y}^A0N,${size},${size}^FD${zplField(text)}^FS`);
    y += size + 12;
  };

  field(label.drugName, 40);
  if (label.din) field(`DIN: ${label.din}`);
  if (label.rxNumber) field(`Rx: ${label.rxNumber}`);
  if (label.directions) field(label.directions, 26);
  for (const w of label.warnings ?? []) field(w, 24);
  if (label.barcode) {
    lines.push(`^FO40,${y}^BCN,80,Y,N,N^FD${zplField(label.barcode)}^FS`);
    y += 110;
  }

  lines.push("^XZ");
  return lines.join("\n");
}
