interface PayslipLineLike {
  label: string;
  type: string;
  amount: { toString: () => string };
  displayOrder: number;
  meta?: Record<string, unknown> | null;
}

interface PayslipHtmlInput {
  payslip: {
    id: string;
    status: string;
    periodStart: Date;
    periodEnd: Date;
    currency: string;
    // Plain Decimal columns (Payslip model isn't encrypted —
    // money lives in Decimal(12,4) per Schema Conventions §4).
    gross: { toString: () => string } | string | null;
    totalDeductions: { toString: () => string } | string | null;
    netPay: { toString: () => string } | string | null;
    lines: PayslipLineLike[];
  };
  employee: {
    employeeCode: string;
    firstName: string;
    lastName: string;
    designationTitle?: string | null;
    departmentName?: string | null;
  };
  tenant: {
    name: string;
    logo?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  };
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtMoney(
  value: { toString: () => string } | string | null | undefined,
  currency: string,
): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value.toString());
  if (!Number.isFinite(n)) return value.toString();
  return `${currency} ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function groupLines(lines: PayslipLineLike[]): {
  earnings: PayslipLineLike[];
  deductions: PayslipLineLike[];
  employerContributions: PayslipLineLike[];
} {
  const earnings: PayslipLineLike[] = [];
  const deductions: PayslipLineLike[] = [];
  const employerContributions: PayslipLineLike[] = [];
  for (const l of lines) {
    if (l.type === "EARNING" || l.type === "REIMBURSEMENT" || l.type === "ADJUSTMENT") {
      earnings.push(l);
    } else if (l.type === "DEDUCTION" || l.type === "STATUTORY_DEDUCTION") {
      deductions.push(l);
    } else if (l.type === "EMPLOYER_CONTRIBUTION") {
      employerContributions.push(l);
    }
  }
  return { earnings, deductions, employerContributions };
}

function fmtPeriodLabel(start: Date, end: Date): string {
  // "May 2026" when the period is a single calendar month, otherwise a range.
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  const month = (d: Date) =>
    d.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  return sameMonth ? month(start) : `${month(start)} – ${month(end)}`;
}

export function renderPayslipHtml(input: PayslipHtmlInput): string {
  const { payslip, employee, tenant } = input;
  const { earnings, deductions, employerContributions } = groupLines(payslip.lines);
  const isDraft = payslip.status === "DRAFT";
  const isVoid = payslip.status === "VOID" || payslip.status === "VOIDED";
  const fullName = `${employee.firstName} ${employee.lastName}`.trim();
  const periodLabel = fmtPeriodLabel(payslip.periodStart, payslip.periodEnd);

  const lineRow = (l: PayslipLineLike) => `
                <tr>
                    <td class="lbl">${esc(l.label)}</td>
                    <td class="amt">${esc(fmtMoney(l.amount, payslip.currency))}</td>
                </tr>`;

  // A balanced two-column ledger needs both sides to be the same length so
  // the Gross / Total-deductions footers line up. Pad the shorter column
  // with empty spacer rows.
  const rowCount = Math.max(earnings.length, deductions.length, 1);
  const padRows = (n: number) =>
    Array.from(
      { length: n },
      () => `
                <tr class="spacer"><td class="lbl">&nbsp;</td><td class="amt"></td></tr>`,
    ).join("");

  const earningsBody = earnings.map(lineRow).join("") + padRows(rowCount - earnings.length);
  const deductionsBody = deductions.length
    ? deductions.map(lineRow).join("") + padRows(rowCount - deductions.length)
    : `<tr class="spacer"><td class="lbl">No deductions</td><td class="amt">—</td></tr>` +
      padRows(rowCount - 1);

  return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Payslip — ${esc(fullName)} — ${esc(periodLabel)}</title>
    <style>
        @media print {
            @page { size: A4; margin: 14mm; }
            html, body { background: #fff; }
            .no-print { display: none !important; }
            .sheet { box-shadow: none; margin: 0; max-width: none; }
        }
        :root {
            --ink: #0f172a;
            --muted: #64748b;
            --line: #e2e8f0;
            --line-strong: #cbd5e1;
            --bg: #f1f5f9;
            --brand: #0f172a;
            --accent: #1d4ed8;
        }
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                Helvetica, Arial, sans-serif;
            font-size: 12.5px;
            line-height: 1.45;
            color: var(--ink);
            margin: 0;
            padding: 24px 16px;
            background: var(--bg);
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .sheet {
            position: relative;
            max-width: 820px;
            margin: 0 auto;
            background: #fff;
            border: 1px solid var(--line);
            border-radius: 10px;
            box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08),
                0 10px 30px rgba(15, 23, 42, 0.06);
            overflow: hidden;
        }
        .watermark {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(-28deg);
            font-size: 150px;
            font-weight: 800;
            letter-spacing: 0.05em;
            color: rgba(15, 23, 42, 0.05);
            pointer-events: none;
            z-index: 0;
        }
        .content { position: relative; z-index: 1; padding: 32px 36px 28px; }

        /* ── Header ───────────────────────────────────────────── */
        .head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 24px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--line);
        }
        .brand { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
        .brand .logo {
            width: 44px; height: 44px; flex: 0 0 44px;
            border-radius: 9px;
            object-fit: contain;
            background: #fff;
            border: 1px solid var(--line);
        }
        .brand .logo-fallback {
            width: 44px; height: 44px; flex: 0 0 44px;
            border-radius: 9px;
            display: flex; align-items: center; justify-content: center;
            background: var(--brand); color: #fff;
            font-weight: 700; font-size: 18px;
        }
        .brand .org { line-height: 1.4; }
        .brand .org .name { font-size: 17px; font-weight: 700; color: var(--ink); }
        .brand .org .meta { font-size: 11px; color: var(--muted); }
        .doc { text-align: right; flex: 0 0 auto; }
        .doc .kicker {
            font-size: 11px; font-weight: 600; letter-spacing: 0.18em;
            text-transform: uppercase; color: var(--muted);
        }
        .doc .period { font-size: 19px; font-weight: 700; margin-top: 2px; }
        .doc .status {
            display: inline-block; margin-top: 8px;
            font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
            text-transform: uppercase;
            padding: 3px 9px; border-radius: 999px;
        }
        .status--final { background: #dcfce7; color: #166534; }
        .status--draft { background: #fef9c3; color: #854d0e; }
        .status--void  { background: #fee2e2; color: #991b1b; }

        /* ── Meta grid ────────────────────────────────────────── */
        .meta {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 18px 24px;
            padding: 20px 0 4px;
        }
        .meta .cell .k {
            font-size: 10px; font-weight: 600; letter-spacing: 0.06em;
            text-transform: uppercase; color: var(--muted); margin: 0 0 2px;
        }
        .meta .cell .v { font-size: 13px; font-weight: 600; color: var(--ink); }

        /* ── Ledger ───────────────────────────────────────────── */
        .ledger {
            display: grid; grid-template-columns: 1fr 1fr;
            gap: 0;
            margin-top: 18px;
            border: 1px solid var(--line);
            border-radius: 8px;
            overflow: hidden;
        }
        .col + .col { border-left: 1px solid var(--line); }
        .col .col-head {
            font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
            text-transform: uppercase; color: var(--muted);
            background: #f8fafc;
            padding: 9px 16px;
            border-bottom: 1px solid var(--line);
        }
        table { width: 100%; border-collapse: collapse; }
        .col td { padding: 7px 16px; border-bottom: 1px solid #f1f5f9; }
        .col td.lbl { color: #334155; }
        .col td.amt {
            text-align: right; font-variant-numeric: tabular-nums;
            white-space: nowrap; color: var(--ink);
        }
        .col tr.spacer td { color: transparent; }
        .col .subtotal td {
            border-top: 1px solid var(--line-strong);
            border-bottom: none;
            font-weight: 700;
            padding-top: 9px; padding-bottom: 11px;
        }

        /* ── Net pay band ─────────────────────────────────────── */
        .net {
            display: flex; align-items: center; justify-content: space-between;
            gap: 16px;
            margin-top: 18px;
            background: var(--brand);
            color: #fff;
            border-radius: 8px;
            padding: 16px 22px;
        }
        .net .net-label { font-size: 12px; letter-spacing: 0.04em; opacity: 0.8; }
        .net .net-sub { font-size: 11px; opacity: 0.65; margin-top: 2px; }
        .net .net-amt { font-size: 24px; font-weight: 800; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }

        /* ── Employer contributions ───────────────────────────── */
        .contrib { margin-top: 18px; }
        .contrib h3 {
            font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
            text-transform: uppercase; color: var(--muted);
            margin: 0 0 8px;
        }
        .contrib table { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
        .contrib td { padding: 7px 16px; border-bottom: 1px solid #f1f5f9; }
        .contrib td.amt { text-align: right; font-variant-numeric: tabular-nums; }
        .contrib tr:last-child td { border-bottom: none; }

        footer {
            margin-top: 24px;
            padding-top: 14px;
            border-top: 1px solid var(--line);
            font-size: 10.5px;
            color: var(--muted);
            display: flex; justify-content: space-between; gap: 16px;
        }

        .print-btn {
            position: fixed; top: 18px; right: 18px;
            background: var(--accent); color: #fff;
            border: 0; padding: 10px 18px;
            border-radius: 8px; cursor: pointer;
            font-size: 13px; font-weight: 600;
            box-shadow: 0 1px 2px rgba(0,0,0,0.15);
            z-index: 20;
        }
        .print-btn:hover { background: #1e40af; }
    </style>
</head>
<body>
    <button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>
    <div class="sheet">
        ${isDraft ? '<div class="watermark">DRAFT</div>' : ""}
        ${isVoid ? '<div class="watermark">VOID</div>' : ""}
        <div class="content">
            <div class="head">
                <div class="brand">
                    ${
                      tenant.logo
                        ? `<img class="logo" src="${esc(tenant.logo)}" alt="${esc(tenant.name)} logo" />`
                        : `<div class="logo-fallback">${esc((tenant.name || "?").charAt(0).toUpperCase())}</div>`
                    }
                    <div class="org">
                        <div class="name">${esc(tenant.name)}</div>
                        ${tenant.address ? `<div class="meta">${esc(tenant.address)}</div>` : ""}
                        ${
                          tenant.phone || tenant.email
                            ? `<div class="meta">${esc(tenant.phone ?? "")}${tenant.phone && tenant.email ? " · " : ""}${esc(tenant.email ?? "")}</div>`
                            : ""
                        }
                    </div>
                </div>
                <div class="doc">
                    <div class="kicker">Payslip</div>
                    <div class="period">${esc(periodLabel)}</div>
                    <span class="status ${isVoid ? "status--void" : isDraft ? "status--draft" : "status--final"}">${esc(payslip.status)}</span>
                </div>
            </div>

            <div class="meta">
                <div class="cell">
                    <p class="k">Employee</p>
                    <p class="v">${esc(fullName)}</p>
                </div>
                <div class="cell">
                    <p class="k">Employee code</p>
                    <p class="v">${esc(employee.employeeCode)}</p>
                </div>
                <div class="cell">
                    <p class="k">Designation</p>
                    <p class="v">${esc(employee.designationTitle ?? "—")}</p>
                </div>
                <div class="cell">
                    <p class="k">Department</p>
                    <p class="v">${esc(employee.departmentName ?? "—")}</p>
                </div>
                <div class="cell">
                    <p class="k">Pay period</p>
                    <p class="v">${esc(fmtDate(payslip.periodStart))} → ${esc(fmtDate(payslip.periodEnd))}</p>
                </div>
                <div class="cell">
                    <p class="k">Currency</p>
                    <p class="v">${esc(payslip.currency)}</p>
                </div>
                <div class="cell" style="grid-column: span 2;">
                    <p class="k">Reference</p>
                    <p class="v" style="font-weight: 500; font-size: 11.5px; color: var(--muted);">${esc(payslip.id)}</p>
                </div>
            </div>

            <div class="ledger">
                <div class="col">
                    <div class="col-head">Earnings</div>
                    <table>
                        <tbody>${earningsBody}
                            <tr class="subtotal">
                                <td class="lbl">Gross pay</td>
                                <td class="amt">${esc(fmtMoney(payslip.gross, payslip.currency))}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="col">
                    <div class="col-head">Deductions</div>
                    <table>
                        <tbody>${deductionsBody}
                            <tr class="subtotal">
                                <td class="lbl">Total deductions</td>
                                <td class="amt">${esc(fmtMoney(payslip.totalDeductions, payslip.currency))}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="net">
                <div>
                    <div class="net-label">Net pay</div>
                    <div class="net-sub">${esc(periodLabel)} · paid to ${esc(fullName)}</div>
                </div>
                <div class="net-amt">${esc(fmtMoney(payslip.netPay, payslip.currency))}</div>
            </div>

            ${
              employerContributions.length > 0
                ? `
            <div class="contrib">
                <h3>Employer contributions (informational)</h3>
                <table><tbody>${employerContributions.map(lineRow).join("")}</tbody></table>
            </div>`
                : ""
            }

            <footer>
                <span>This is a computer-generated payslip and does not require a signature.</span>
                <span>Questions about your pay? Contact your HR team.</span>
            </footer>
        </div>
    </div>
</body>
</html>`;
}
