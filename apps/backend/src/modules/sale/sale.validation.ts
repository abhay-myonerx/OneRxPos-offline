import { z } from "zod";

// ─── Enums match schema exactly ────────────────────────────────────────────────
// SaleStatus:    COMPLETED | PARTIAL | VOIDED | RETURNED
// PaymentMethod: CASH | CARD | MOBILE_BANKING | GIFT_CARD | STORE_CREDIT | OTHER
// PaymentStatus: COMPLETED | PENDING | FAILED | REFUNDED

// ── Checkout (POST /sales/checkout) ───────────────────────────────────────────

const checkoutItemSchema = z.object({
  productId: z.string().uuid("Invalid product UUID"),
  variantId: z.string().uuid("Invalid variant UUID").optional().nullable(),
  quantity: z.number().int().positive("Quantity must be a positive integer"),
  unitPrice: z.number().min(0, "Unit price cannot be negative"),
  // Per-item discount amount (not percent) — 0 if none
  discount: z.number().min(0).default(0),
  // ── Rx-at-till (Phase 2.2) ───────────────────────────────────────────────
  // A prescription-only line (NEEDS_RX / NARCOTIC schedule) carries its linked
  // Rx here. PII-FREE: only the Rx number + copay — never patient/prescriber
  // data. Persisted as an `RxLink` row on the created sale. A behind-counter
  // consult ack does NOT ride here; it flows as an `RX_CONSULT` override in
  // `overrides[]` (context = productId).
  rx: z
    .object({
      rxNumber: z.string().min(1).max(50),
      copay: z.number().nonnegative().optional(),
    })
    .optional(),
});

const checkoutPaymentSchema = z.object({
  method: z.enum(["CASH", "CARD", "MOBILE_BANKING", "GIFT_CARD", "STORE_CREDIT", "OTHER"]),
  amount: z.number().positive("Payment amount must be positive"),
  referenceNo: z.string().max(255).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const checkoutSchema = z.object({
  storeId: z.string().uuid("Invalid store UUID"),
  customerId: z.string().uuid("Invalid customer UUID").optional().nullable(),
  shiftId: z.string().uuid("Invalid shift UUID").optional().nullable(),
  items: z.array(checkoutItemSchema).min(1, "At least one item is required"),
  payments: z.array(checkoutPaymentSchema).min(1, "At least one payment is required"),
  notes: z.string().max(1000).optional().nullable(),
  // ── Pricing Brain (Phase 1.2) — tax/discount inputs for `priceCart` ──────
  // Cart-level tax exemption (e.g. First Nations point-of-sale exemption).
  exemption: z.enum(["FIRST_NATIONS", "DIPLOMATIC"]).optional().nullable(),
  // Cart-level discount, applied on top of any per-line discounts.
  cartDiscount: z.number().min(0).default(0),
  cartDiscountMode: z.enum(["flat", "percent"]).default("flat"),
  // 3H.4: optional coupon code applied server-side at checkout.
  couponCode: z.string().max(64).optional().nullable(),
  // 3H.5: optional loyalty points to redeem as a tender at checkout.
  redeemPoints: z.number().int().min(0).optional(),
  // ── Manager-override grants (Phase 1.3a Task 9) ──────────────────────────
  // Each grant was minted inline (Phase 1.1's `requestOverride`) for a
  // specific gated action + context (e.g. a price override on one line).
  // `context` is forwarded VERBATIM to `consumeOverride` — it hashes it, so
  // it must be byte-for-byte identical to what the authorizer approved.
  overrides: z
    .array(
      z.object({
        action: z.string(),
        context: z.string(),
        grant: z.string(),
      }),
    )
    .optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ── List sales (GET /sales) query params ──────────────────────────────────────
// All fields are optional — validated with Zod, never cast with `as string`

export const listSalesSchema = z.object({
  storeId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  cashierId: z.string().uuid().optional(),
  status: z.enum(["COMPLETED", "PARTIAL", "VOIDED", "RETURNED"]).optional(),
  invoiceNo: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "grandTotal", "invoiceNo"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListSalesInput = z.infer<typeof listSalesSchema>;

// ── Void sale (POST /sales/:id/void) ──────────────────────────────────────────

export const voidSaleSchema = z.object({
  notes: z.string().max(500).optional().nullable(),
});

export type VoidSaleInput = z.infer<typeof voidSaleSchema>;

// ── Return sale (POST /sales/:id/return) ──────────────────────────────────────

export const returnSaleSchema = z.object({
  notes: z.string().max(500).optional().nullable(),
  // Optional: partial return items. If empty → full return.
  items: z
    .array(
      z.object({
        saleItemId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .optional(),
});

export type ReturnSaleInput = z.infer<typeof returnSaleSchema>;
