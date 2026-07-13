import type { Levy } from "rx-pos-shared";
import type { Product } from "@/features/products/types/product.types";

/**
 * Resolve the levies that currently apply to a product, for populating
 * `CartItem.levies` when an item is added to the cart. Mirrors the backend's
 * filter in `checkout.service.ts` (`processCheckout`) — active, effective-dated
 * levies only — so the cart preview matches what checkout will actually charge.
 * The backend remains authoritative at checkout time; this is a display-time
 * best-effort mirror, not the source of truth.
 */
export function getActiveLevies(product: Product, now: Date = new Date()): Levy[] {
  return (product.productLevies ?? [])
    .filter(
      (pl) =>
        pl.levy.isActive &&
        new Date(pl.levy.effectiveFrom) <= now &&
        (pl.levy.effectiveTo == null || new Date(pl.levy.effectiveTo) >= now),
    )
    .map(
      (pl): Levy => ({
        code: pl.levy.code,
        name: pl.levy.name,
        mode: pl.levy.mode,
        amount: pl.levy.amount,
        taxable: pl.levy.taxable,
      }),
    );
}
