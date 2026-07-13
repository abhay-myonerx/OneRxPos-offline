import type { CartItem } from "@/features/pos/types/cart.types";
import type { CheckoutInput } from "@/features/pos/types/checkout.types";
import type { CheckoutPayment } from "@/features/pos/types/checkout.types";

export function cartToCheckoutInput(
  items: CartItem[],
  payments: CheckoutPayment[],
  storeId: string,
  customerId?: string | null,
  shiftId?: string | null,
  notes?: string,
): CheckoutInput {
  return {
    storeId,
    customerId: customerId || undefined,
    shiftId: shiftId || undefined,
    items: items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId || undefined,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discount: i.discount,
    })),
    payments,
    notes,
  };
}
