// 3H.1 — renders a purchase order as email HTML for sending to its supplier.

import { esc } from "../messaging/messaging.render";

interface POItemLike {
  product?: { name?: string | null } | null;
  orderedQty: number;
  unitCost: unknown;
}
interface POLike {
  purchaseNo?: string | null;
  grandTotal?: unknown;
  expectedDate?: unknown;
  notes?: string | null;
  supplier?: { name?: string | null } | null;
  items: POItemLike[];
}

function money(v: unknown): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

export function renderPurchaseOrderHtml(po: POLike): string {
  const rows = po.items
    .map(
      (it) =>
        `<tr><td>${esc(it.product?.name ?? "")}</td>` +
        `<td style="text-align:right">${esc(it.orderedQty)}</td>` +
        `<td style="text-align:right">${esc(money(it.unitCost))}</td>` +
        `<td style="text-align:right">${esc(money(Number(it.unitCost ?? 0) * it.orderedQty))}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif">
    <h2>Purchase Order ${esc(po.purchaseNo ?? "")}</h2>
    <p>Supplier: <strong>${esc(po.supplier?.name ?? "")}</strong></p>
    ${po.expectedDate ? `<p>Expected: ${esc(String(po.expectedDate).slice(0, 10))}</p>` : ""}
    <table cellpadding="6" style="border-collapse:collapse;width:100%">
      <thead><tr style="text-align:left;border-bottom:1px solid #ccc">
        <th>Item</th><th style="text-align:right">Qty</th>
        <th style="text-align:right">Unit</th><th style="text-align:right">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="border-top:1px solid #ccc">
        <td colspan="3" style="text-align:right"><strong>Grand total</strong></td>
        <td style="text-align:right"><strong>${esc(money(po.grandTotal))}</strong></td>
      </tr></tfoot>
    </table>
    ${po.notes ? `<p style="color:#555">${esc(po.notes)}</p>` : ""}
  </body></html>`;
}
