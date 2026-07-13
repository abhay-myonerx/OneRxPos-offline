import type { TaxCategory } from "rx-pos-shared";
import type { CartItem } from "../types/cart.types";

export function buildMiscCartLine(args: {
  miscProductId: string;
  description: string;
  price: number;
  taxCategory: TaxCategory;
  grant: string;
  authorizerUserId: string;
  lineId: string;
}): CartItem {
  return {
    id: args.lineId,
    productId: args.miscProductId,
    name: args.description,
    sku: "__MISC__",
    unitPrice: args.price,
    costPrice: 0,
    quantity: 1,
    discount: 0,
    taxCategory: args.taxCategory,
    taxInclusive: false,
    levies: [],
    maxStock: 999,
    isMisc: true,
    priceOverride: { originalPrice: 0, grant: args.grant, authorizerUserId: args.authorizerUserId },
  };
}
