import type { Product } from "@/features/products/types/product.types";
import { ProductType } from "@/types/enums/status.enums";
import { getProductLevelStockState } from "@/features/pos/helpers/pos-stock";
import { getActiveLevies } from "@/features/pos/helpers/product-tax";

export function productToCartItem(product: Product, storeId?: string) {
  if (product.productType === ProductType.VARIABLE) {
    throw new Error("productToCartItem: VARIABLE products require a selected variant");
  }
  const state = getProductLevelStockState(product, storeId ?? null);
  const maxStock = state.kind === "tracked" ? state.quantity : 999;
  return {
    id: `${product.id}-none`,
    productId: product.id,
    productType: product.productType,
    variantId: null,
    name: product.name,
    sku: product.sku,
    unitPrice: parseFloat(product.sellPrice),
    costPrice: parseFloat(product.costPrice),
    quantity: 1,
    discount: 0,
    taxCategory: product.taxCategory,
    taxInclusive: product.taxInclusive,
    levies: getActiveLevies(product),
    maxStock,
  };
}
