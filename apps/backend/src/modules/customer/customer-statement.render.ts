// 3H.6 — renders a customer's statement of account as HTML (used by both the
// print/preview endpoint and the 3H.1 email). Shows the 30/60/90 aging summary,
// the open invoices with their age, recent payments, and the closing balance.

import { esc } from "../messaging/messaging.render";
import type { CustomerStatement } from "../report/ar-report.service";

function money(v: unknown): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}
function day(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const cell = 'style="text-align:right"';

export function renderStatementHtml(s: CustomerStatement): string {
  const invoiceRows = s.openInvoices
    .map(
      (inv) =>
        `<tr><td>${esc(day(inv.date))}</td><td>${esc(inv.invoiceNo)}</td>` +
        `<td ${cell}>${esc(inv.ageDays)}</td>` +
        `<td ${cell}>${esc(money(inv.grandTotal))}</td>` +
        `<td ${cell}>${esc(money(inv.dueAmount))}</td></tr>`,
    )
    .join("");

  const paymentRows = s.recentPayments
    .map(
      (p) =>
        `<tr><td>${esc(day(p.date))}</td><td>Payment (${esc(p.method)})</td>` +
        `<td ${cell}>-${esc(money(p.amount))}</td></tr>`,
    )
    .join("");

  const reconNote = s.reconciled
    ? ""
    : `<p style="color:#b45309;font-size:12px">Note: the aged invoices total
       (${esc(money(s.aging.total))}) differs from the account balance
       (${esc(money(s.currentBalance))}) — some payments were applied to the
       account without a specific invoice.</p>`;

  return `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif">
    <h2>Statement of account</h2>
    <p>For: <strong>${esc(s.customer.name)}</strong> &nbsp; As of: ${esc(day(s.asOf))}</p>

    <h3 style="margin-bottom:4px">Aging summary</h3>
    <table cellpadding="6" style="border-collapse:collapse;width:100%">
      <thead><tr style="text-align:right;border-bottom:1px solid #ccc">
        <th>Current</th><th>31–60</th><th>61–90</th><th>90+</th><th>Total</th>
      </tr></thead>
      <tbody><tr>
        <td ${cell}>${esc(money(s.aging.current))}</td>
        <td ${cell}>${esc(money(s.aging.d31_60))}</td>
        <td ${cell}>${esc(money(s.aging.d61_90))}</td>
        <td ${cell}>${esc(money(s.aging.d90plus))}</td>
        <td ${cell}><strong>${esc(money(s.aging.total))}</strong></td>
      </tr></tbody>
    </table>

    <h3 style="margin-bottom:4px">Open invoices</h3>
    <table cellpadding="6" style="border-collapse:collapse;width:100%">
      <thead><tr style="text-align:left;border-bottom:1px solid #ccc">
        <th>Date</th><th>Invoice</th><th ${cell}>Age (days)</th>
        <th ${cell}>Amount</th><th ${cell}>Due</th>
      </tr></thead>
      <tbody>${invoiceRows || '<tr><td colspan="5">No open invoices.</td></tr>'}</tbody>
    </table>

    ${
      paymentRows
        ? `<h3 style="margin-bottom:4px">Recent payments</h3>
    <table cellpadding="6" style="border-collapse:collapse;width:100%"><tbody>${paymentRows}</tbody></table>`
        : ""
    }

    <p style="margin-top:12px">Account balance: <strong>${esc(money(s.currentBalance))}</strong></p>
    ${reconNote}
  </body></html>`;
}
