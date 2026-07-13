"use client";

import type { CartTotals as CartTotalsValue } from "@/features/pos/helpers/checkout-math";
import { formatMoney } from "@/lib/currency/format-money";

// ── CartTotals ───────────────────────────────────────────────────────────────
// Moved out of page.tsx (Phase 1.3a decomposition, Task 10) — the pure
// subtotal/discount/tax/total waterfall display driven by computeCartTotals.
// cartDiscountMode/cartDiscountInput are page-local UI state (not part of the
// computed totals) needed only to render the "(X%)" label on the discount line.

export interface CartTotalsProps {
  totals: CartTotalsValue;
  cartDiscountMode: "flat" | "percent";
  cartDiscountInput: string;
}

export function CartTotals({ totals, cartDiscountMode, cartDiscountInput }: CartTotalsProps) {
  const subtotalNum = totals.subtotal.toNumber();
  const itemDiscountNum = totals.itemDiscount.toNumber();
  const cartDiscountNum = totals.cartDiscount.toNumber();
  const taxTotalNum = totals.taxTotal.toNumber();
  const grandTotalNum = totals.grandTotal.toNumber();
  const { totalQty } = totals;

  return (
    <div className="space-y-1 text-[13px]">
      <div className="flex justify-between text-slate-500 dark:text-slate-400">
        <span>
          Subtotal ({totalQty} item{totalQty !== 1 ? "s" : ""})
        </span>
        <span className="tabular-nums">{formatMoney(subtotalNum)}</span>
      </div>
      {itemDiscountNum > 0 && (
        <div className="flex justify-between text-danger-500">
          <span>Item Discounts</span>
          <span className="tabular-nums">-{formatMoney(itemDiscountNum)}</span>
        </div>
      )}
      {cartDiscountNum > 0 && (
        <div className="flex justify-between text-danger-500">
          <span>
            Cart Discount
            {cartDiscountMode === "percent" && ` (${cartDiscountInput}%)`}
          </span>
          <span className="tabular-nums">-{formatMoney(cartDiscountNum)}</span>
        </div>
      )}
      {taxTotalNum > 0 && (
        <div className="flex justify-between text-slate-500 dark:text-slate-400">
          <span>Tax</span>
          <span className="tabular-nums">+{formatMoney(taxTotalNum)}</span>
        </div>
      )}
      <div className="flex justify-between text-base font-medium text-slate-900 dark:text-slate-100 pt-2 border-t border-slate-200 dark:border-slate-800">
        <span>Total</span>
        <span className="tabular-nums">{formatMoney(grandTotalNum)}</span>
      </div>
    </div>
  );
}
