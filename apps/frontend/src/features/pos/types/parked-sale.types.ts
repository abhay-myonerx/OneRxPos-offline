import type { ProvinceCode } from "rx-pos-shared";
import type { CartItem, CartState } from "./cart.types";

/**
 * Marker left on a resumed cart line whose manager authorization was stripped
 * at park time (Phase 1.3b, decision B3). The overridden price stays on the
 * line so the cart looks identical on resume, but a FRESH grant must be
 * obtained before checkout — see the checkout re-auth guard in `useRingUp`.
 * `originalPrice` is the pre-override catalog price, needed to rebuild the
 * `priceOverrideCtx` context when re-authorizing (misc/open-price lines carry
 * no catalog price, so they only need the `openPriceItem` kind).
 */
export type LineReauth =
  | { kind: "priceOverride"; originalPrice: number }
  | { kind: "openPriceItem" };

/** Over-cap cart discount that needs re-authorization after a resume. */
export interface DiscountReauth {
  mode: "flat" | "percent";
  value: number;
}

/**
 * A cart line as stored in a parked snapshot: grant tokens are stripped
 * (`priceOverride` removed) and replaced with a `reauth` marker where an
 * authorization existed. Signed grants are NEVER written to storage (B3).
 */
export type ParkedCartItem = Omit<CartItem, "priceOverride"> & {
  reauth?: LineReauth;
};

/**
 * The serialized, grant-free cart. Restoring this rebuilds the Redux cart
 * state plus the cart-level discount that lives in `useRingUp` local state.
 */
export interface ParkedSnapshot {
  items: ParkedCartItem[];
  customerId: string | null;
  storeId: string | null;
  shiftId: string | null;
  notes: string;
  storeProvince: ProvinceCode | null;
  /** Cart-level discount (useRingUp local state — not in the cart slice). */
  cartDiscount: number;
  cartDiscountMode: "flat" | "percent";
  /** Present when the parked cart had an over-cap discount needing re-auth. */
  discountReauth: DiscountReauth | null;
}

/** Display + routing metadata carried alongside a parked snapshot. */
export interface ParkedSaleMeta {
  /** Client-generated id (crypto.randomUUID); the idempotency key for the mirror. */
  id: string;
  storeId: string | null;
  customerId: string | null;
  label: string | null;
  parkedByUserId: string | null;
  parkedByName: string | null;
  /** ISO timestamp. */
  parkedAt: string;
  itemCount: number;
  total: number;
}

/** A full parked-sale record: metadata + snapshot + provenance for merge. */
export interface ParkedSaleRecord extends ParkedSaleMeta {
  snapshot: ParkedSnapshot;
  /**
   * Where this record was last seen. `local` = written to this device's
   * IndexedDB (may or may not be mirrored yet); `remote` = fetched from the
   * backend store list. Used by `mergeRecallList` to dedupe local ∪ remote.
   */
  origin: "local" | "remote";
}

/** The result of deserializing a snapshot back into live state. */
export interface RestoredCart {
  cartState: CartState;
  cartDiscount: number;
  cartDiscountMode: "flat" | "percent";
}
