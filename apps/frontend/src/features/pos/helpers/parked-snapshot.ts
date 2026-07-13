import type { CartItem, CartState } from "../types/cart.types";
import type {
  ParkedCartItem,
  ParkedSnapshot,
  RestoredCart,
} from "../types/parked-sale.types";

/**
 * Pure serialization for park/resume (Phase 1.3b).
 *
 * `serializeSnapshot` turns the live cart (Redux `CartState` + the cart-level
 * discount that lives in `useRingUp` local state) into a grant-free
 * `ParkedSnapshot`: every signed override grant is stripped and replaced with a
 * `reauth` marker (decision B3), so a resumed sale must re-obtain a fresh
 * manager grant before checkout and no grant token is ever written to storage.
 *
 * `deserializeSnapshot` is the inverse: it reconstructs the `CartState` (with
 * `discountOverride` forced to `null` and the `reauth` markers preserved) plus
 * the cart discount value/mode to restore into local state.
 */
export function serializeSnapshot(
  cart: CartState,
  cartDiscount: number,
  cartDiscountMode: "flat" | "percent",
): ParkedSnapshot {
  const items: ParkedCartItem[] = cart.items.map((item) => {
    const { priceOverride, reauth, ...rest } = item;
    let nextReauth = reauth;
    if (priceOverride) {
      nextReauth = item.isMisc
        ? { kind: "openPriceItem" }
        : { kind: "priceOverride", originalPrice: priceOverride.originalPrice };
    }
    return nextReauth ? { ...rest, reauth: nextReauth } : { ...rest };
  });

  // A parked cart's over-cap discount needs re-auth on resume whether the grant
  // is still live (discountOverride) or the cart was already resumed-but-not-yet
  // re-authorized (discountReauth) and is now being re-parked.
  const discountReauth = cart.discountOverride
    ? { mode: cart.discountOverride.mode, value: cart.discountOverride.value }
    : (cart.discountReauth ?? null);

  return {
    items,
    customerId: cart.customerId,
    storeId: cart.storeId,
    shiftId: cart.shiftId,
    notes: cart.notes,
    storeProvince: cart.storeProvince,
    cartDiscount,
    cartDiscountMode,
    discountReauth,
  };
}

export function deserializeSnapshot(snapshot: ParkedSnapshot): RestoredCart {
  const items: CartItem[] = snapshot.items.map((item) => ({ ...item }));

  const cartState: CartState = {
    items,
    customerId: snapshot.customerId,
    storeId: snapshot.storeId,
    shiftId: snapshot.shiftId,
    notes: snapshot.notes,
    storeProvince: snapshot.storeProvince,
    // Grants were stripped at park time; a resumed cart never carries a live
    // discount grant — the re-auth flow rebuilds it. Keep the marker so the
    // checkout guard blocks until a manager re-approves.
    discountOverride: null,
    discountReauth: snapshot.discountReauth,
  };

  return {
    cartState,
    cartDiscount: snapshot.cartDiscount,
    cartDiscountMode: snapshot.cartDiscountMode,
  };
}

/** True when a restored cart still has authorizations awaiting re-approval. */
export function snapshotNeedsReauth(snapshot: ParkedSnapshot): boolean {
  return snapshot.items.some((i) => i.reauth) || snapshot.discountReauth != null;
}
