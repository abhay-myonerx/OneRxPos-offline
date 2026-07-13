import type { ReceiptJob, ReceiptLine } from "./hal.types";

export interface ReceiptContentItem {
  name: string;
  quantity: number;
  lineTotal: string; // pre-formatted amount, e.g. "24.00"
}

/** Normalized receipt data → the input to the printable ReceiptJob. */
export interface ReceiptContent {
  business: { name?: string | null; address?: string | null; phone?: string | null };
  store?: { name?: string | null; address?: string | null };
  invoiceNo: string;
  date: string;
  time: string;
  cashierName?: string | null;
  items: ReceiptContentItem[];
  totals: {
    subtotal: string;
    taxTotal: string;
    grandTotal: string;
    paidAmount?: string | null;
    changeAmount?: string | null;
  };
  payments?: Array<{ method: string; amount: string }>;
  currencySymbol?: string;
  footer?: string | null;
}

/** Left text + right-aligned amount padded to `cols` (left truncated if needed). */
function row(left: string, right: string, cols: number): string {
  const maxLeft = Math.max(0, cols - right.length - 1);
  const l = left.length > maxLeft ? left.slice(0, maxLeft) : left;
  const pad = Math.max(1, cols - l.length - right.length);
  return l + " ".repeat(pad) + right;
}

/**
 * Build a printable ReceiptJob from a sale's receipt content, formatted for an
 * 80mm thermal roll (48 cols by default). Centered pharmacy header, invoice +
 * date/time stamp, right-aligned item/total columns, tender + change, an invoice
 * barcode, and a cut. Pure — renders identically to bytes via renderReceipt.
 */
export function buildReceiptJob(c: ReceiptContent, opts: { cols?: number } = {}): ReceiptJob {
  const cols = opts.cols ?? 48;
  const sym = c.currencySymbol ?? "$";
  const money = (s: string): string => `${sym}${s}`;
  const rule = "-".repeat(cols);

  const header: ReceiptLine[] = [];
  if (c.business.name) header.push({ text: c.business.name, align: "center", bold: true });
  if (c.business.address) header.push({ text: c.business.address, align: "center" });
  if (c.business.phone) header.push({ text: c.business.phone, align: "center" });
  if (c.store?.name) header.push({ text: c.store.name, align: "center" });

  const lines: ReceiptLine[] = [];
  lines.push({ text: rule });
  lines.push({ text: `Invoice: ${c.invoiceNo}` });
  lines.push({ text: `Date: ${c.date}  ${c.time}` });
  if (c.cashierName) lines.push({ text: `Cashier: ${c.cashierName}` });
  lines.push({ text: rule });

  for (const it of c.items) {
    lines.push({ text: row(`${it.name} x${it.quantity}`, money(it.lineTotal), cols) });
  }

  lines.push({ text: rule });
  lines.push({ text: row("Subtotal", money(c.totals.subtotal), cols) });
  lines.push({ text: row("Tax", money(c.totals.taxTotal), cols) });
  lines.push({ text: row("TOTAL", money(c.totals.grandTotal), cols), bold: true });
  if (c.totals.paidAmount) lines.push({ text: row("Paid", money(c.totals.paidAmount), cols) });
  if (c.totals.changeAmount && Number(c.totals.changeAmount) > 0) {
    lines.push({ text: row("Change", money(c.totals.changeAmount), cols) });
  }
  for (const p of c.payments ?? []) {
    lines.push({ text: row(p.method.replace(/_/g, " "), money(p.amount), cols) });
  }

  lines.push({ text: rule });
  lines.push({ text: c.footer ?? "Merci / Thank you!", align: "center" });

  return { header, lines, barcode: c.invoiceNo, cut: true };
}
