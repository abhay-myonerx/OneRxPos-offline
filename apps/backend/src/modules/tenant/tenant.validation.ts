// Zod schemas for tenant endpoints

import { z } from "zod";

// ── Update tenant profile ──────────────────────────────────────────────────
export const updateTenantSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(1000).optional().nullable(),
  logo: z.string().url("Logo must be a valid URL").optional().nullable(),
});

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

// ── Update tenant settings (JSON blob — currency, tax, receipt, etc.) ──────
export const updateSettingsSchema = z
  .object({
    // Currency
    currency: z.string().length(3, "Currency must be a 3-letter ISO code").optional(),
    currencySymbol: z.string().max(5).optional(),
    currencyPosition: z.enum(["before", "after"]).optional(),
    decimalPlaces: z.number().int().min(0).max(4).optional(),

    // Locale
    timezone: z.string().max(50).optional(),
    dateFormat: z.string().max(20).optional(),
    language: z.string().max(10).optional(),

    // Tax
    taxEnabled: z.boolean().optional(),
    defaultTaxRate: z.number().min(0).max(100).optional(),
    taxRegistrationNo: z.string().max(100).optional(),

    // Receipt (legacy — kept for backward compatibility; prefer ReceiptTemplate)
    receiptHeader: z.string().max(500).optional(),
    receiptFooter: z.string().max(500).optional(),

    // Inventory
    lowStockThreshold: z.number().int().min(0).optional(),
    allowNegativeStock: z.boolean().optional(),
    enableExpiryTracking: z.boolean().optional(),

    // Loyalty
    enableLoyalty: z.boolean().optional(),

    // Invoice
    invoicePrefix: z.string().max(10).optional(),
    purchasePrefix: z.string().max(10).optional(),
    quotationPrefix: z.string().max(10).optional(),

    // Auto-print receipt after checkout
    autoPrintReceipt: z.boolean().optional(),
    defaultReceiptFormat: z.enum(["thermal", "html", "data"]).optional(),
  })
  .passthrough(); // Allow additional custom settings

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

// ── SUPER_ADMIN: Change tenant plan ────────────────────────────────────────
export const changePlanSchema = z.object({
  plan: z.enum(["FREE", "STARTER", "PRO", "ENTERPRISE"]),
});

export type ChangePlanInput = z.infer<typeof changePlanSchema>;

// ── SUPER_ADMIN: Change tenant status ──────────────────────────────────────
export const changeStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "TRIAL", "CANCELLED"]),
  reason: z.string().max(500).optional(),
});

export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
