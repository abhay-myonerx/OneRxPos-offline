import type { Product, ProductVariant } from "@/features/products/types/product.types";
import { ProductType } from "@/types/enums/status.enums";

export type StockState =
  { kind: "untracked" } | { kind: "unlimited" } | { kind: "tracked"; quantity: number };

type StockRow = { storeId: string; quantity: number };

function quantitiesForStore(rows: StockRow[] | undefined | null, storeId: string): number[] {
  if (!rows?.length) return [];
  return rows.filter((r) => r.storeId === storeId).map((r) => r.quantity);
}

export function stockStateFromQuantities(quantities: number[]): StockState {
  if (!quantities.length) return { kind: "untracked" };
  if (quantities.some((q) => q >= 999)) return { kind: "unlimited" };
  const sum = quantities.reduce((a, b) => a + b, 0);
  return { kind: "tracked", quantity: sum };
}

/** Product-level rows (standard / non-variable sellable stock). */
export function getProductLevelStockState(product: Product, storeId: string | null): StockState {
  if (!storeId) return { kind: "untracked" };
  return stockStateFromQuantities(quantitiesForStore(product.storeStock, storeId));
}

/** Single variant's stock at a store (variable products). */
export function getVariantStockState(variant: ProductVariant, storeId: string | null): StockState {
  if (!storeId) return { kind: "untracked" };
  return stockStateFromQuantities(quantitiesForStore(variant.storeStock, storeId));
}

/** Aggregate variant stock for POS grid filters / coarse availability (sum across variants). */
export function getVariableProductAggregateStockState(
  product: Product,
  storeId: string | null,
): StockState {
  if (!storeId || !product.variants?.length) return { kind: "untracked" };
  const all: number[] = [];
  for (const v of product.variants) {
    all.push(...quantitiesForStore(v.storeStock, storeId));
  }
  return stockStateFromQuantities(all);
}

/** Stock semantics for POS listing (variable → aggregate variant stock; else product-level). */
export function getPosListingStockState(product: Product, storeId: string | null): StockState {
  if (product.productType === ProductType.VARIABLE) {
    return getVariableProductAggregateStockState(product, storeId);
  }
  return getProductLevelStockState(product, storeId);
}
