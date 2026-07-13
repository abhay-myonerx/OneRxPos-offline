import { ProductType } from "@/types/enums/status.enums";
import type { Levy, ProvinceCode, TaxCategory } from "rx-pos-shared";
import type { DiscountReauth, LineReauth } from "./parked-sale.types";

export interface CartItem {
  id: string;
  productId: string;
  /** Present on new lines so checkout can enforce VARIABLE → variantId rules. */
  productType?: ProductType;
  variantId?: string | null;
  name: string;
  sku: string;
  unitPrice: number;
  costPrice: number;
  quantity: number;
  discount: number;
  /** Drives the shared pricing engine's federal/provincial treatment (rx-pos-shared). */
  taxCategory: TaxCategory;
  taxInclusive: boolean;
  /** Levies (environmental fees, etc.) attached to the product at the time it was added. */
  levies: Levy[];
  maxStock: number;
  /** True for open-price / miscellaneous lines (reference the tenant Misc product). */
  isMisc?: boolean;
  /** Set when a manager authorized a manual price for this line. */
  priceOverride?: { originalPrice: number; grant: string; authorizerUserId: string };
  /**
   * Set on a line RESUMED from a parked sale whose grant was stripped at park
   * time (Phase 1.3b, B3). The overridden `unitPrice` is kept, but a fresh
   * manager grant must be obtained (which clears this marker and re-sets
   * `priceOverride`) before checkout — see the re-auth guard in `useRingUp`.
   */
  reauth?: LineReauth;
  // ── Pharmacy (Phase 2.2) ───────────────────────────────────────────────
  /** Drug identification number linking this product to the drug catalog (2.1). */
  din?: string | null;
  /** Resolved schedule category (override ?? catalog ?? OPEN); drives enforcement UI. */
  scheduleCategory?: "NEEDS_RX" | "NARCOTIC" | "BEHIND_COUNTER" | "OPEN";
  /** PII-free prescription link: Rx number + copay. Sets the line price to the copay. */
  rx?: { rxNumber: string; copay?: number };
  /** Pharmacist consult acknowledged (behind-counter) — backed by an RX_CONSULT grant. */
  consultAck?: boolean;
  /** The RX_CONSULT override grant + context (productId) to ride to checkout. */
  consultGrant?: { grant: string; authorizerUserId: string; context: string };
}

export interface CartState {
  items: CartItem[];
  customerId: string | null;
  storeId: string | null;
  shiftId: string | null;
  notes: string;
  /** Active store's province, resolved once a store is selected; drives tax computation. */
  storeProvince: ProvinceCode | null;
  /**
   * Set when a manager authorized an over-cap cart discount. `mode`/`value`
   * record the EXACT discount the grant was obtained for (the same inputs
   * fed into `discountOverCapCtx` when requesting it) so callers can detect
   * divergence from the currently committed cart discount — see the
   * reconciliation effect in `useRingUp` that clears this out the moment
   * the committed discount no longer matches, preventing a stale grant from
   * riding into checkout's rebuilt context and failing the backend's hash
   * check closed.
   */
  discountOverride?: { grant: string; authorizerUserId: string; mode: "flat" | "percent"; value: number } | null;
  /**
   * Set on a cart RESUMED from a parked sale that carried an over-cap discount
   * (Phase 1.3b, B3). The discount value/mode is restored, but a fresh manager
   * grant must be obtained (clearing this and setting `discountOverride`)
   * before checkout.
   */
  discountReauth?: DiscountReauth | null;
}
