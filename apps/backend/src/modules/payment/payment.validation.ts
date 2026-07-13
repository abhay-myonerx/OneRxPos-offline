import { z } from "zod";

// ── Collect due payment from a customer ─────────────────────────────────────
export const collectDueSchema = z.object({
  customerId: z.string().uuid("Invalid customer UUID"),
  saleId: z.string().uuid("Invalid sale UUID").optional().nullable(),
  method: z.enum(["CASH", "CARD", "MOBILE_BANKING", "GIFT_CARD", "STORE_CREDIT", "OTHER"]),
  amount: z.number().positive("Payment amount must be positive"),
  referenceNo: z.string().max(255).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type CollectDueInput = z.infer<typeof collectDueSchema>;

// ── List payments query params ──────────────────────────────────────────────
export const listPaymentsSchema = z.object({
  saleId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  method: z
    .enum(["CASH", "CARD", "MOBILE_BANKING", "GIFT_CARD", "STORE_CREDIT", "OTHER"])
    .optional(),
  status: z.enum(["COMPLETED", "PENDING", "FAILED", "REFUNDED"]).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "amount"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListPaymentsInput = z.infer<typeof listPaymentsSchema>;
