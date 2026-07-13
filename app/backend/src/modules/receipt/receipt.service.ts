// Receipt template CRUD + on-the-fly receipt generation from Sale data
//
// Architecture decision:
//   Receipts are NOT stored separately. The Sale table already holds all
//   transactional data. A receipt is a formatted VIEW of Sale + Tenant
//   settings + ReceiptTemplate config, generated on demand.

import { buildReceiptJob, shouldKickDrawer, type ReceiptContent } from "rx-pos-shared";
import { prisma, TenantPrismaClient } from "../../config/database";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { logger } from "../../shared/utils/logger";
import type { UpsertReceiptTemplateInput } from "./receipt.validation";
import { listDeviceProfiles, type DeviceProfileDto } from "../hardware/device-profile.service";
import { printReceiptToDevice, type DeviceConnection } from "../hardware/device-io";
import { formatReceiptDate, formatReceiptTime } from "../../shared/utils/datetime";

// ─── Default display options ────────────────────────────────────────────────

const DEFAULT_DISPLAY_OPTIONS = {
  showLogo: true,
  showBarcode: true,
  showQrCode: false,
  showTaxBreakdown: true,
  showCashierName: true,
  showCustomerInfo: true,
  showPaymentDetails: true,
  showStoreName: true,
  showStoreAddress: true,
  showItemSku: false,
  showItemBarcode: false,
  showDiscountColumn: true,
  showTaxColumn: true,
  showLoyaltyPoints: true,
  showDueAmount: true,
  paperSize: "80mm",
  fontSize: "medium",
};

// ─── Get receipt template ───────────────────────────────────────────────────

export async function getReceiptTemplate(db: TenantPrismaClient) {
  const template = await db.receiptTemplate.findFirst({
    where: { isActive: true },
  });

  if (!template) {
    // Return a sensible empty template so the frontend always gets a shape
    return {
      id: null,
      configured: false,
      name: "Default",
      logoUrl: null,
      businessName: null,
      businessAddress: null,
      businessPhone: null,
      businessEmail: null,
      taxId: null,
      website: null,
      headerText: null,
      footerText: null,
      termsText: null,
      thankYouMsg: "Thank you for your purchase!",
      displayOptions: DEFAULT_DISPLAY_OPTIONS,
      customFields: [],
      isActive: true,
    };
  }

  return {
    ...template,
    configured: true,
    displayOptions: { ...DEFAULT_DISPLAY_OPTIONS, ...(template.displayOptions as object) },
    customFields: (template.customFields as Array<{ label: string; value: string }>) ?? [],
  };
}

// ─── Upsert receipt template (create or update — one per tenant) ────────────

export async function upsertReceiptTemplate(
  db: TenantPrismaClient,
  tenantId: string,
  input: UpsertReceiptTemplateInput,
) {
  const existing = await db.receiptTemplate.findFirst();

  const data = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
    ...(input.businessName !== undefined && { businessName: input.businessName }),
    ...(input.businessAddress !== undefined && { businessAddress: input.businessAddress }),
    ...(input.businessPhone !== undefined && { businessPhone: input.businessPhone }),
    ...(input.businessEmail !== undefined && { businessEmail: input.businessEmail }),
    ...(input.taxId !== undefined && { taxId: input.taxId }),
    ...(input.website !== undefined && { website: input.website }),
    ...(input.headerText !== undefined && { headerText: input.headerText }),
    ...(input.footerText !== undefined && { footerText: input.footerText }),
    ...(input.termsText !== undefined && { termsText: input.termsText }),
    ...(input.thankYouMsg !== undefined && { thankYouMsg: input.thankYouMsg }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
  };

  // Merge display options instead of overwriting
  if (input.displayOptions) {
    const currentOpts = existing ? (existing.displayOptions as Record<string, unknown>) : {};
    (data as Record<string, unknown>).displayOptions = {
      ...DEFAULT_DISPLAY_OPTIONS,
      ...currentOpts,
      ...input.displayOptions,
    };
  }

  // Replace custom fields entirely (they're an ordered list)
  if (input.customFields !== undefined) {
    (data as Record<string, unknown>).customFields = input.customFields;
  }

  let template;

  if (existing) {
    template = await db.receiptTemplate.update({
      where: { id: existing.id },
      data,
    });
    logger.info({ tenantId }, "Receipt template updated");
  } else {
    template = await db.receiptTemplate.create({
      data: {
        tenantId,
        name: input.name ?? "Default",
        logoUrl: input.logoUrl ?? null,
        businessName: input.businessName ?? null,
        businessAddress: input.businessAddress ?? null,
        businessPhone: input.businessPhone ?? null,
        businessEmail: input.businessEmail ?? null,
        taxId: input.taxId ?? null,
        website: input.website ?? null,
        headerText: input.headerText ?? null,
        footerText: input.footerText ?? null,
        termsText: input.termsText ?? null,
        thankYouMsg: input.thankYouMsg ?? "Thank you for your purchase!",
        displayOptions: input.displayOptions ?? DEFAULT_DISPLAY_OPTIONS,
        customFields: input.customFields ?? [],
      },
    });
    logger.info({ tenantId }, "Receipt template created");
  }

  return {
    ...template,
    configured: true,
    displayOptions: { ...DEFAULT_DISPLAY_OPTIONS, ...(template.displayOptions as object) },
    customFields: (template.customFields as Array<{ label: string; value: string }>) ?? [],
  };
}

// ─── Generate receipt for a sale ────────────────────────────────────────────

export interface ReceiptData {
  receipt: {
    invoiceNo: string;
    date: string;
    time: string;
    isDuplicate: boolean;
    status: string;
  };
  business: {
    name: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    taxId: string | null;
    website: string | null;
    logoUrl: string | null;
  };
  store: {
    id: string;
    name: string;
    code: string;
    address: string | null;
    phone: string | null;
  };
  cashier: {
    id: string;
    name: string;
  };
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    loyaltyPoints: number;
  } | null;
  items: Array<{
    name: string;
    sku: string;
    barcode: string | null;
    variantName: string | null;
    quantity: number;
    unitPrice: string;
    discount: string;
    taxRate: string;
    taxAmount: string;
    lineTotal: string;
  }>;
  totals: {
    subtotal: string;
    discountAmount: string;
    taxTotal: string;
    grandTotal: string;
    paidAmount: string;
    dueAmount: string;
    changeAmount: string;
    itemCount: number;
    totalQuantity: number;
  };
  payments: Array<{
    method: string;
    amount: string;
    referenceNo: string | null;
    status: string;
  }>;
  loyalty: {
    pointsEarned: number;
    totalPoints: number;
  } | null;
  template: {
    headerText: string | null;
    footerText: string | null;
    termsText: string | null;
    thankYouMsg: string | null;
    customFields: Array<{ label: string; value: string }>;
    displayOptions: Record<string, unknown>;
  };
  currency: {
    code: string;
    symbol: string;
    position: string;
    decimals: number;
  };
}

export async function generateReceipt(
  db: TenantPrismaClient,
  tenantId: string,
  saleId: string,
  options: { format: string; duplicate: boolean },
): Promise<ReceiptData | string> {
  // ── 1. Load the sale with all relations ───────────────────────────────────

  const sale = await db.sale.findUnique({
    where: { id: saleId },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, barcode: true },
          },
          variant: {
            select: { id: true, name: true, sku: true },
          },
        },
      },
      payments: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          loyaltyPoints: true,
        },
      },
      cashier: {
        select: { id: true, firstName: true, lastName: true },
      },
      store: {
        select: { id: true, name: true, code: true, address: true, phone: true },
      },
    },
  });

  if (!sale) throw new NotFoundError("Sale", saleId);

  // ── 2. Load receipt template ──────────────────────────────────────────────

  const template = await getReceiptTemplate(db);

  // ── 3. Load tenant settings for currency ──────────────────────────────────

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true, name: true, address: true, phone: true, email: true, logo: true },
  });

  const settings = (tenant?.settings as Record<string, unknown>) ?? {};

  const currency = {
    code: (settings.currency as string) ?? "USD",
    symbol: (settings.currencySymbol as string) ?? "$",
    position: (settings.currencyPosition as string) ?? "before",
    decimals: (settings.decimalPlaces as number) ?? 2,
  };

  // ── 4. Load loyalty points earned on this sale ────────────────────────────

  let loyaltyData = null;
  if (sale.customer) {
    const loyaltyTx = await db.loyaltyTransaction.findFirst({
      where: { saleId: sale.id, type: "EARNED" },
      select: { points: true },
    });

    if (loyaltyTx) {
      loyaltyData = {
        pointsEarned: loyaltyTx.points,
        totalPoints: sale.customer.loyaltyPoints,
      };
    }
  }

  // ── 5. Build receipt data ─────────────────────────────────────────────────

  const saleDate = new Date(sale.createdAt);
  // Print in the store's configured timezone (Settings → Regional), falling
  // back to the runtime clock. Locale controls date/time wording (defaults to
  // the prior en-US formatting when unset).
  const receiptTz = (settings.timezone as string) || undefined;
  const receiptLocale = (settings.locale as string) || "en-US";

  const receiptData: ReceiptData = {
    receipt: {
      invoiceNo: sale.invoiceNo,
      date: formatReceiptDate(saleDate, receiptTz, receiptLocale),
      time: formatReceiptTime(saleDate, receiptTz, receiptLocale),
      isDuplicate: options.duplicate,
      status: sale.status,
    },

    business: {
      name: template.businessName ?? tenant?.name ?? null,
      address: template.businessAddress ?? tenant?.address ?? null,
      phone: template.businessPhone ?? tenant?.phone ?? null,
      email: template.businessEmail ?? tenant?.email ?? null,
      taxId: template.taxId ?? null,
      website: template.website ?? null,
      logoUrl: template.logoUrl ?? tenant?.logo ?? null,
    },

    store: {
      id: sale.store.id,
      name: sale.store.name,
      code: sale.store.code,
      address: sale.store.address,
      phone: sale.store.phone,
    },

    cashier: {
      id: sale.cashier.id,
      name: `${sale.cashier.firstName} ${sale.cashier.lastName}`,
    },

    customer: sale.customer
      ? {
          id: sale.customer.id,
          name: sale.customer.name,
          phone: sale.customer.phone,
          email: sale.customer.email,
          loyaltyPoints: sale.customer.loyaltyPoints,
        }
      : null,

    items: sale.items.map((item) => ({
      name: item.product.name,
      sku: item.product.sku,
      barcode: item.product.barcode,
      variantName: item.variant?.name ?? null,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice).toFixed(currency.decimals),
      discount: Number(item.discount).toFixed(currency.decimals),
      taxRate: Number(item.taxRate).toFixed(2),
      taxAmount: Number(item.taxAmount).toFixed(currency.decimals),
      lineTotal: Number(item.lineTotal).toFixed(currency.decimals),
    })),

    totals: {
      subtotal: Number(sale.subtotal).toFixed(currency.decimals),
      discountAmount: Number(sale.discountAmount).toFixed(currency.decimals),
      taxTotal: Number(sale.taxTotal).toFixed(currency.decimals),
      grandTotal: Number(sale.grandTotal).toFixed(currency.decimals),
      paidAmount: Number(sale.paidAmount).toFixed(currency.decimals),
      dueAmount: Number(sale.dueAmount).toFixed(currency.decimals),
      changeAmount: Number(sale.changeAmount).toFixed(currency.decimals),
      itemCount: sale.items.length,
      totalQuantity: sale.items.reduce((sum, i) => sum + i.quantity, 0),
    },

    payments: sale.payments.map((p) => ({
      method: p.method,
      amount: Number(p.amount).toFixed(currency.decimals),
      referenceNo: p.referenceNo,
      status: p.status,
    })),

    loyalty: loyaltyData,

    template: {
      headerText: template.headerText,
      footerText: template.footerText,
      termsText: template.termsText,
      thankYouMsg: template.thankYouMsg,
      customFields: template.customFields,
      displayOptions: template.displayOptions as Record<string, unknown>,
    },

    currency,
  };

  // ── 6. Return in requested format ─────────────────────────────────────────

  if (options.format === "html") {
    return renderReceiptHtml(receiptData);
  }

  if (options.format === "thermal") {
    return renderThermalReceipt(receiptData);
  }

  // default: "data"
  return receiptData;
}

// ─── HTML receipt renderer ──────────────────────────────────────────────────

/**
 * Escapes HTML special characters so tenant-controlled data (business / store /
 * customer / product names, custom template text, etc.) can never inject markup
 * or script when this HTML is served directly (the `format=html` endpoint sets
 * `Content-Type: text/html`) or emailed. Mirrors the payslip renderer's `esc`.
 */
function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderReceiptHtml(data: ReceiptData): string {
  const opts = data.template.displayOptions;
  const cur = data.currency;

  const fmt = (val: string) =>
    cur.position === "before" ? `${cur.symbol}${val}` : `${val}${cur.symbol}`;

  const lines: string[] = [];

  lines.push(`<!DOCTYPE html>`);
  lines.push(`<html><head><meta charset="utf-8">`);
  lines.push(`<title>Receipt ${esc(data.receipt.invoiceNo)}</title>`);
  lines.push(`<style>`);
  lines.push(getReceiptCss(opts.paperSize as string));
  lines.push(`</style></head><body>`);
  lines.push(`<div class="receipt">`);

  // Duplicate banner
  if (data.receipt.isDuplicate) {
    lines.push(`<div class="duplicate-banner">*** DUPLICATE ***</div>`);
  }

  // Logo
  if (opts.showLogo && data.business.logoUrl) {
    lines.push(`<div class="logo"><img src="${esc(data.business.logoUrl)}" alt="Logo" /></div>`);
  }

  // Business info
  if (data.business.name) {
    lines.push(`<div class="business-name">${esc(data.business.name)}</div>`);
  }
  if (data.business.address) {
    lines.push(`<div class="business-address">${esc(data.business.address)}</div>`);
  }
  if (data.business.phone) {
    lines.push(`<div class="business-contact">Tel: ${esc(data.business.phone)}</div>`);
  }
  if (data.business.email) {
    lines.push(`<div class="business-contact">${esc(data.business.email)}</div>`);
  }
  if (data.business.taxId) {
    lines.push(`<div class="business-contact">Tax ID: ${esc(data.business.taxId)}</div>`);
  }
  if (data.business.website) {
    lines.push(`<div class="business-contact">${esc(data.business.website)}</div>`);
  }

  // Header text
  if (data.template.headerText) {
    lines.push(`<div class="header-text">${esc(data.template.headerText)}</div>`);
  }

  lines.push(`<div class="divider"></div>`);

  // Store info
  if (opts.showStoreName) {
    lines.push(
      `<div class="store-name">Store: ${esc(data.store.name)} (${esc(data.store.code)})</div>`,
    );
  }
  if (opts.showStoreAddress && data.store.address) {
    lines.push(`<div class="store-address">${esc(data.store.address)}</div>`);
  }

  // Invoice / date / cashier
  lines.push(
    `<div class="meta-row"><span>Invoice:</span><span>${esc(data.receipt.invoiceNo)}</span></div>`,
  );
  lines.push(
    `<div class="meta-row"><span>Date:</span><span>${esc(data.receipt.date)}</span></div>`,
  );
  lines.push(
    `<div class="meta-row"><span>Time:</span><span>${esc(data.receipt.time)}</span></div>`,
  );

  if (opts.showCashierName) {
    lines.push(
      `<div class="meta-row"><span>Cashier:</span><span>${esc(data.cashier.name)}</span></div>`,
    );
  }

  // Customer
  if (opts.showCustomerInfo && data.customer) {
    lines.push(
      `<div class="meta-row"><span>Customer:</span><span>${esc(data.customer.name)}</span></div>`,
    );
    if (data.customer.phone) {
      lines.push(
        `<div class="meta-row"><span>Phone:</span><span>${esc(data.customer.phone)}</span></div>`,
      );
    }
  }

  lines.push(`<div class="divider"></div>`);

  // Items table
  lines.push(`<table class="items-table"><thead><tr>`);
  lines.push(`<th class="item-name">Item</th><th>Qty</th><th>Price</th>`);
  if (opts.showDiscountColumn) lines.push(`<th>Disc</th>`);
  if (opts.showTaxColumn) lines.push(`<th>Tax</th>`);
  lines.push(`<th class="item-total">Total</th>`);
  lines.push(`</tr></thead><tbody>`);

  for (const item of data.items) {
    const itemLabel = item.variantName
      ? `${esc(item.name)} (${esc(item.variantName)})`
      : esc(item.name);

    lines.push(`<tr>`);
    lines.push(`<td class="item-name">${itemLabel}</td>`);
    lines.push(`<td>${item.quantity}</td>`);
    lines.push(`<td>${fmt(item.unitPrice)}</td>`);
    if (opts.showDiscountColumn) {
      lines.push(`<td>${Number(item.discount) > 0 ? fmt(item.discount) : "-"}</td>`);
    }
    if (opts.showTaxColumn) {
      lines.push(`<td>${Number(item.taxAmount) > 0 ? fmt(item.taxAmount) : "-"}</td>`);
    }
    lines.push(`<td class="item-total">${fmt(item.lineTotal)}</td>`);
    lines.push(`</tr>`);

    // SKU / barcode sub-row
    if (opts.showItemSku || opts.showItemBarcode) {
      const meta: string[] = [];
      if (opts.showItemSku) meta.push(`SKU: ${esc(item.sku)}`);
      if (opts.showItemBarcode && item.barcode) meta.push(`Barcode: ${esc(item.barcode)}`);
      const colSpan = 4 + (opts.showDiscountColumn ? 1 : 0) + (opts.showTaxColumn ? 1 : 0);
      lines.push(`<tr class="item-meta"><td colspan="${colSpan}">${meta.join(" | ")}</td></tr>`);
    }
  }

  lines.push(`</tbody></table>`);
  lines.push(`<div class="divider"></div>`);

  // Totals
  lines.push(`<div class="totals">`);
  lines.push(
    `<div class="total-row"><span>Subtotal (${data.totals.itemCount} items, ${data.totals.totalQuantity} qty)</span><span>${fmt(data.totals.subtotal)}</span></div>`,
  );

  if (Number(data.totals.discountAmount) > 0) {
    lines.push(
      `<div class="total-row"><span>Discount</span><span>-${fmt(data.totals.discountAmount)}</span></div>`,
    );
  }

  if (opts.showTaxBreakdown && Number(data.totals.taxTotal) > 0) {
    lines.push(
      `<div class="total-row"><span>Tax</span><span>${fmt(data.totals.taxTotal)}</span></div>`,
    );
  }

  lines.push(
    `<div class="total-row grand-total"><span>Grand Total</span><span>${fmt(data.totals.grandTotal)}</span></div>`,
  );
  lines.push(`</div>`);

  // Payments
  if (opts.showPaymentDetails) {
    lines.push(`<div class="divider"></div>`);
    lines.push(`<div class="payments">`);
    for (const p of data.payments) {
      const label = p.method.replace(/_/g, " ");
      lines.push(`<div class="total-row"><span>${label}</span><span>${fmt(p.amount)}</span></div>`);
    }
    if (Number(data.totals.changeAmount) > 0) {
      lines.push(
        `<div class="total-row"><span>Change</span><span>${fmt(data.totals.changeAmount)}</span></div>`,
      );
    }
    if (opts.showDueAmount && Number(data.totals.dueAmount) > 0) {
      lines.push(
        `<div class="total-row due-amount"><span>Due Amount</span><span>${fmt(data.totals.dueAmount)}</span></div>`,
      );
    }
    lines.push(`</div>`);
  }

  // Loyalty points
  if (opts.showLoyaltyPoints && data.loyalty) {
    lines.push(`<div class="divider"></div>`);
    lines.push(`<div class="loyalty">`);
    lines.push(
      `<div class="total-row"><span>Points Earned</span><span>+${data.loyalty.pointsEarned}</span></div>`,
    );
    lines.push(
      `<div class="total-row"><span>Total Points</span><span>${data.loyalty.totalPoints}</span></div>`,
    );
    lines.push(`</div>`);
  }

  // Custom fields
  if (data.template.customFields.length > 0) {
    lines.push(`<div class="divider"></div>`);
    for (const field of data.template.customFields) {
      lines.push(
        `<div class="meta-row"><span>${esc(field.label)}:</span><span>${esc(field.value)}</span></div>`,
      );
    }
  }

  // Barcode placeholder
  if (opts.showBarcode) {
    lines.push(`<div class="barcode-area">`);
    lines.push(`<div class="barcode-text">${esc(data.receipt.invoiceNo)}</div>`);
    lines.push(`</div>`);
  }

  // Terms
  if (data.template.termsText) {
    lines.push(`<div class="divider"></div>`);
    lines.push(`<div class="terms-text">${esc(data.template.termsText)}</div>`);
  }

  // Footer
  lines.push(`<div class="divider"></div>`);
  if (data.template.thankYouMsg) {
    lines.push(`<div class="thank-you">${esc(data.template.thankYouMsg)}</div>`);
  }
  if (data.template.footerText) {
    lines.push(`<div class="footer-text">${esc(data.template.footerText)}</div>`);
  }

  // Sale status
  if (data.receipt.status === "VOIDED") {
    lines.push(`<div class="status-banner voided">*** VOIDED ***</div>`);
  } else if (data.receipt.status === "RETURNED") {
    lines.push(`<div class="status-banner returned">*** RETURNED ***</div>`);
  }

  lines.push(`</div></body></html>`);

  return lines.join("\n");
}

// ─── Thermal receipt renderer (structured text for POS printers) ────────────

function renderThermalReceipt(data: ReceiptData): string {
  const cur = data.currency;
  const w = data.template.displayOptions.paperSize === "58mm" ? 32 : 48;

  const fmt = (val: string) =>
    cur.position === "before" ? `${cur.symbol}${val}` : `${val}${cur.symbol}`;

  const center = (text: string) => {
    const pad = Math.max(0, Math.floor((w - text.length) / 2));
    return " ".repeat(pad) + text;
  };

  const line = (left: string, right: string) => {
    const gap = Math.max(1, w - left.length - right.length);
    return left + " ".repeat(gap) + right;
  };

  const divider = "-".repeat(w);
  const lines: string[] = [];

  if (data.receipt.isDuplicate) {
    lines.push(center("*** DUPLICATE ***"));
    lines.push("");
  }

  if (data.business.name) lines.push(center(data.business.name));
  if (data.business.address) lines.push(center(data.business.address));
  if (data.business.phone) lines.push(center(`Tel: ${data.business.phone}`));
  if (data.business.taxId) lines.push(center(`Tax ID: ${data.business.taxId}`));

  if (data.template.headerText) {
    lines.push("");
    lines.push(center(data.template.headerText));
  }

  lines.push(divider);

  lines.push(line("Invoice:", data.receipt.invoiceNo));
  lines.push(line("Date:", `${data.receipt.date} ${data.receipt.time}`));

  if (data.template.displayOptions.showCashierName) {
    lines.push(line("Cashier:", data.cashier.name));
  }

  if (data.template.displayOptions.showStoreName) {
    lines.push(line("Store:", `${data.store.name} (${data.store.code})`));
  }

  if (data.template.displayOptions.showCustomerInfo && data.customer) {
    lines.push(line("Customer:", data.customer.name));
  }

  lines.push(divider);

  // Items
  for (const item of data.items) {
    const itemLabel = item.variantName ? `${item.name} (${item.variantName})` : item.name;

    lines.push(itemLabel);
    const detail = `  ${item.quantity} x ${fmt(item.unitPrice)}`;
    lines.push(line(detail, fmt(item.lineTotal)));
  }

  lines.push(divider);

  // Totals
  lines.push(line(`Subtotal (${data.totals.totalQuantity} items)`, fmt(data.totals.subtotal)));

  if (Number(data.totals.discountAmount) > 0) {
    lines.push(line("Discount", `-${fmt(data.totals.discountAmount)}`));
  }
  if (Number(data.totals.taxTotal) > 0) {
    lines.push(line("Tax", fmt(data.totals.taxTotal)));
  }

  lines.push(divider);
  lines.push(line("GRAND TOTAL", fmt(data.totals.grandTotal)));
  lines.push(divider);

  // Payments
  for (const p of data.payments) {
    lines.push(line(p.method.replace(/_/g, " "), fmt(p.amount)));
  }
  if (Number(data.totals.changeAmount) > 0) {
    lines.push(line("Change", fmt(data.totals.changeAmount)));
  }
  if (Number(data.totals.dueAmount) > 0) {
    lines.push(line("DUE AMOUNT", fmt(data.totals.dueAmount)));
  }

  // Loyalty
  if (data.template.displayOptions.showLoyaltyPoints && data.loyalty) {
    lines.push(divider);
    lines.push(line("Points Earned", `+${data.loyalty.pointsEarned}`));
    lines.push(line("Total Points", `${data.loyalty.totalPoints}`));
  }

  // Custom fields
  if (data.template.customFields.length > 0) {
    lines.push(divider);
    for (const f of data.template.customFields) {
      lines.push(line(`${f.label}:`, f.value));
    }
  }

  // Barcode
  if (data.template.displayOptions.showBarcode) {
    lines.push("");
    lines.push(center(data.receipt.invoiceNo));
  }

  // Footer
  lines.push(divider);
  if (data.template.thankYouMsg) lines.push(center(data.template.thankYouMsg));
  if (data.template.footerText) lines.push(center(data.template.footerText));

  // Status banner
  if (data.receipt.status === "VOIDED") {
    lines.push("");
    lines.push(center("*** VOIDED ***"));
  } else if (data.receipt.status === "RETURNED") {
    lines.push("");
    lines.push(center("*** RETURNED ***"));
  }

  lines.push(""); // trailing newline for printer feed

  return lines.join("\n");
}

// ─── Receipt CSS ────────────────────────────────────────────────────────────

function getReceiptCss(paperSize: string): string {
  const maxWidth = paperSize === "58mm" ? "58mm" : paperSize === "80mm" ? "80mm" : "210mm";

  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; background: #fff; }
    .receipt {
      max-width: ${maxWidth};
      margin: 0 auto;
      padding: 8px;
      font-size: ${paperSize === "58mm" ? "10px" : "12px"};
      line-height: 1.4;
    }
    .logo { text-align: center; margin-bottom: 8px; }
    .logo img { max-width: 60%; max-height: 60px; }
    .business-name { text-align: center; font-weight: bold; font-size: 1.3em; }
    .business-address, .business-contact { text-align: center; font-size: 0.9em; }
    .header-text { text-align: center; margin-top: 4px; font-style: italic; }
    .store-name { font-weight: bold; }
    .store-address { font-size: 0.9em; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .meta-row { display: flex; justify-content: space-between; font-size: 0.9em; }
    .items-table { width: 100%; border-collapse: collapse; font-size: 0.85em; }
    .items-table th { text-align: left; border-bottom: 1px solid #000; padding: 2px 4px; }
    .items-table td { padding: 2px 4px; vertical-align: top; }
    .items-table th:not(.item-name), .items-table td:not(.item-name) { text-align: right; }
    .item-meta td { font-size: 0.8em; color: #555; padding-top: 0; }
    .totals, .payments, .loyalty { font-size: 0.95em; }
    .total-row { display: flex; justify-content: space-between; padding: 1px 0; }
    .grand-total { font-weight: bold; font-size: 1.2em; border-top: 2px solid #000; padding-top: 4px; margin-top: 4px; }
    .due-amount { color: #c00; font-weight: bold; }
    .barcode-area { text-align: center; margin: 8px 0; }
    .barcode-text { font-family: 'Libre Barcode 39', 'Courier New', monospace; font-size: 2em; letter-spacing: 4px; }
    .terms-text { font-size: 0.8em; text-align: center; color: #555; }
    .thank-you { text-align: center; font-weight: bold; margin: 4px 0; }
    .footer-text { text-align: center; font-size: 0.85em; color: #555; }
    .duplicate-banner, .status-banner { text-align: center; font-weight: bold; font-size: 1.1em; padding: 4px; }
    .voided { color: #c00; }
    .returned { color: #d80; }
    @media print {
      body { margin: 0; }
      .receipt { padding: 0; }
    }
  `;
}

// ─── Print a sale receipt to a network printer (Phase 2.11 — auto-print) ─────
// Assembles the sale's receipt content, builds an 80mm ReceiptJob (pharmacy
// header + invoice + date/time + items + totals + barcode + cut), resolves the
// store's network printer from its DeviceProfile, and sends the ESC/POS bytes.

export interface PrintReceiptResult {
  ok: boolean;
  reason?: string;
}

function toReceiptContent(d: ReceiptData): ReceiptContent {
  return {
    business: { name: d.business.name, address: d.business.address, phone: d.business.phone },
    store: { name: d.store.name, address: d.store.address },
    invoiceNo: d.receipt.invoiceNo,
    date: d.receipt.date,
    time: d.receipt.time,
    cashierName: d.cashier.name,
    items: d.items.map((i) => ({ name: i.name, quantity: i.quantity, lineTotal: i.lineTotal })),
    totals: {
      subtotal: d.totals.subtotal,
      taxTotal: d.totals.taxTotal,
      grandTotal: d.totals.grandTotal,
      paidAmount: d.totals.paidAmount,
      changeAmount: d.totals.changeAmount,
    },
    payments: d.payments.map((p) => ({ method: p.method, amount: p.amount })),
    currencySymbol: d.currency.symbol,
    footer: d.template.thankYouMsg ?? d.template.footerText,
  };
}

function isActivePrinter(dp: DeviceProfileDto): boolean {
  return dp.kind === "printer" && dp.isActive;
}

export async function printSaleReceipt(
  db: TenantPrismaClient,
  tenantId: string,
  saleId: string,
  deviceId?: string,
): Promise<PrintReceiptResult> {
  const data = (await generateReceipt(db, tenantId, saleId, {
    format: "json",
    duplicate: false,
  })) as ReceiptData;

  const job = buildReceiptJob(toReceiptContent(data));

  // Money-safety gate: pop the cash drawer as part of the receipt print for
  // physical-cash tenders only (CASH) — NEVER for card/gift/loyalty. The kick
  // rides the same ESC/POS stream to the printer the drawer is chained to.
  if (data.payments.some((p) => shouldKickDrawer(p.method))) {
    job.openDrawer = true;
  }

  const devices = await listDeviceProfiles(db);
  const device = deviceId
    ? devices.find((d) => d.id === deviceId)
    : devices.find((d) => d.storeId === data.store.id && isActivePrinter(d)) ??
      devices.find(isActivePrinter);

  if (!device) return { ok: false, reason: "no-printer-configured" };
  const conn = device.connection as DeviceConnection | null;
  if (!conn || typeof (conn as { kind?: unknown }).kind !== "string") {
    return { ok: false, reason: "printer-misconfigured" };
  }
  // Per-device presentation (command set / codepage) lives in the profile's
  // config; default to the ESC/POS Western codepage the network path used.
  const cfg = (device.config ?? {}) as { commandSet?: "escpos" | "star"; codepage?: string };
  await printReceiptToDevice(job, conn, {
    codepage: cfg.codepage ?? "cp858",
    commandSet: cfg.commandSet,
  });
  return { ok: true };
}
