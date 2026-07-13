export interface OverrideRequest {
  action: string;
  context: string;
}
export function priceOverrideCtx(productId: string, oldPrice: number, newPrice: number): OverrideRequest {
  return { action: "PRICE_OVERRIDE", context: `${productId}:${oldPrice}->${newPrice}` };
}
export function discountOverCapCtx(mode: "percent" | "flat", value: number): OverrideRequest {
  return { action: "DISCOUNT_OVER_CAP", context: `${mode}:${value}` };
}
export function voidLineCtx(productId: string): OverrideRequest {
  return { action: "VOID_LINE", context: productId };
}
export function voidTransactionCtx(itemCount: number): OverrideRequest {
  return { action: "VOID_TRANSACTION", context: `count:${itemCount}` };
}
export function openPriceItemCtx(price: number, description: string): OverrideRequest {
  return { action: "OPEN_PRICE_ITEM", context: `${price}:${description}` };
}
