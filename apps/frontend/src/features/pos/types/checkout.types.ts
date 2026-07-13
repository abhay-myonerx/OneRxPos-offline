import { PaymentMethod } from "@/types/enums/status.enums";

export interface CheckoutPayment {
  method: PaymentMethod;
  amount: number;
  referenceNo?: string;
  notes?: string;
}

export interface CheckoutInput {
  storeId: string;
  customerId?: string;
  shiftId?: string;
  items: {
    productId: string;
    variantId?: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    /** Phase 2.2 — PII-free prescription link (Rx number + copay). */
    rx?: { rxNumber: string; copay?: number };
  }[];
  cartDiscount?: number;
  cartDiscountMode?: "flat" | "percent";
  /** 3H.4 — optional coupon code; the server applies eligible promotions + this
   *  coupon authoritatively (client cannot inject discounts). */
  couponCode?: string | null;
  /** 3H.5 — loyalty points to redeem as a tender; the server validates + values them. */
  redeemPoints?: number;
  payments: CheckoutPayment[];
  notes?: string;
  /**
   * Manager-override grants riding along with this checkout (Phase 1.3a,
   * Task 14/9) — one entry per line `priceOverride` plus the cart-level
   * `discountOverride`, if any. `context` MUST be rebuilt with the exact
   * same builder + inputs used when the grant was requested, or the
   * backend's `consumeOverride` sha256(context) hash check fails closed.
   */
  overrides?: { action: string; context: string; grant: string }[];
}
