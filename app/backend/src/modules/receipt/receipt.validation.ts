// Zod schemas for receipt template CRUD + receipt generation

import { z } from "zod";

// ── Display options sub-schema ──────────────────────────────────────────────

const displayOptionsSchema = z
  .object({
    showLogo: z.boolean().default(true),
    showBarcode: z.boolean().default(true),
    showQrCode: z.boolean().default(false),
    showTaxBreakdown: z.boolean().default(true),
    showCashierName: z.boolean().default(true),
    showCustomerInfo: z.boolean().default(true),
    showPaymentDetails: z.boolean().default(true),
    showStoreName: z.boolean().default(true),
    showStoreAddress: z.boolean().default(true),
    showItemSku: z.boolean().default(false),
    showItemBarcode: z.boolean().default(false),
    showDiscountColumn: z.boolean().default(true),
    showTaxColumn: z.boolean().default(true),
    showLoyaltyPoints: z.boolean().default(true),
    showDueAmount: z.boolean().default(true),
    paperSize: z.enum(["58mm", "80mm", "A4"]).default("80mm"),
    fontSize: z.enum(["small", "medium", "large"]).default("medium"),
  })
  .partial();

// ── Custom field sub-schema ─────────────────────────────────────────────────

const customFieldSchema = z.object({
  label: z.string().max(100),
  value: z.string().max(500),
});

// ── Create / Update receipt template ────────────────────────────────────────

export const upsertReceiptTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),

  // Branding
  logoUrl: z.string().url("Logo must be a valid URL").optional().nullable(),
  businessName: z.string().max(255).optional().nullable(),
  businessAddress: z.string().max(1000).optional().nullable(),
  businessPhone: z.string().max(50).optional().nullable(),
  businessEmail: z.string().email().optional().nullable(),
  taxId: z.string().max(100).optional().nullable(),
  website: z.string().max(255).optional().nullable(),

  // Content
  headerText: z.string().max(2000).optional().nullable(),
  footerText: z.string().max(2000).optional().nullable(),
  termsText: z.string().max(2000).optional().nullable(),
  thankYouMsg: z.string().max(500).optional().nullable(),

  // Display options
  displayOptions: displayOptionsSchema.optional(),

  // Custom fields (array of label/value pairs shown on receipt)
  customFields: z.array(customFieldSchema).max(10).optional(),

  isActive: z.boolean().optional(),
});

export type UpsertReceiptTemplateInput = z.infer<typeof upsertReceiptTemplateSchema>;

// ── Generate receipt query params ───────────────────────────────────────────

export const generateReceiptSchema = z.object({
  // "thermal" returns structured JSON for thermal/POS printers
  // "html" returns a full HTML string ready for browser print
  // "data" returns raw structured data for frontend rendering
  format: z.enum(["thermal", "html", "data"]).default("data"),
  duplicate: z.coerce.boolean().default(false),
});

export type GenerateReceiptQuery = z.infer<typeof generateReceiptSchema>;
