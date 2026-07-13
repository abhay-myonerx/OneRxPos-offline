"use client";

import {
  ShoppingCart,
  CreditCard,
  X,
  Percent,
  Tag,
  UserPlus,
  PauseCircle,
  ArchiveRestore,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/currency/format-money";
import { CartRow } from "@/features/pos/components/CartRow";
import { CartTotals } from "@/features/pos/components/CartTotals";
import { CouponInput } from "@/features/promotions/components/CouponInput";
import { RedeemPoints } from "@/features/pos/components/RedeemPoints";
import { OverrideGateModal } from "@/features/pos/components/OverrideGateModal";
import type { RingUp } from "@/features/pos/hooks/useRingUp";
import type { CartItem } from "@/features/pos/types/cart.types";

// ── CartPanel ────────────────────────────────────────────────────────────────
// Moved out of page.tsx (Phase 1.3a decomposition, Task 11) — the right
// column: cart header (customer picker + quick-add), scrollable line-item
// list, cart-level discount UI, CartTotals, and the "Charge" button. All
// state/handlers are owned by useRingUp; this component is presentational
// and takes them as props. The payment/quick-create/variant/receipt modals
// stay in page.tsx (they're shared overlay UI, not part of either column).

export type CartPanelProps = Pick<
  RingUp,
  | "cart"
  | "customers"
  | "handleClearCart"
  | "handleCustomerChange"
  | "setQuickCreateOpen"
  | "expandedItemId"
  | "setExpandedItemId"
  | "handleQuantityChange"
  | "handleDiscountChange"
  | "handleRemoveItem"
  | "totalQty"
  | "groupDiscountBanner"
  | "handleClearGroupDiscount"
  | "showCartDiscount"
  | "setShowCartDiscount"
  | "cartDiscountNum"
  | "cartDiscountMode"
  | "cartDiscountInput"
  | "applyCartDiscount"
  | "handleClearCartDiscountInput"
  | "totals"
  | "effectiveStoreId"
  | "handleOpenPaymentModal"
  | "grandTotalNum"
> & {
  /** Opens PriceOverrideModal for a given line (Phase 1.3a, Task 14). Optional
   * so existing render call sites/tests that don't wire it are unaffected. */
  onPriceOverride?: (item: CartItem) => void;
  /** Discount-cap + void/clear gating (Phase 1.3a, Task 16). Optional so
   * existing render call sites/tests that don't wire them are unaffected —
   * without them, the gated controls simply have no prompt to show (a
   * no-op in tests that stub `handleRemoveItem`/`handleClearCart` directly). */
  pendingGate?: RingUp["pendingGate"];
  handleGateGranted?: RingUp["handleGateGranted"];
  handleGateClose?: RingUp["handleGateClose"];
  /** Suspend/resume (Phase 1.3b). Optional so existing call sites/tests are unaffected. */
  handleOpenPark?: RingUp["handleOpenPark"];
  handleOpenRecall?: RingUp["handleOpenRecall"];
  handleReauthLine?: RingUp["handleReauthLine"];
  handleReauthDiscount?: RingUp["handleReauthDiscount"];
  /** Pharmacy schedule enforcement (Phase 2.2). Optional. */
  handleOpenLinkRx?: RingUp["handleOpenLinkRx"];
  handleUnlinkRx?: RingUp["handleUnlinkRx"];
  handleConsult?: RingUp["handleConsult"];
  /** 3H.4 coupon entry. Optional so existing call sites/tests are unaffected. */
  setCouponCode?: RingUp["setCouponCode"];
  /** 3H.5 loyalty redemption. Optional so existing call sites/tests are unaffected. */
  redeemPoints?: RingUp["redeemPoints"];
  setRedeemPoints?: RingUp["setRedeemPoints"];
  loyaltyProgram?: RingUp["loyaltyProgram"];
  customerLoyaltyPoints?: RingUp["customerLoyaltyPoints"];
};

export function CartPanel({
  cart,
  customers,
  handleClearCart,
  handleCustomerChange,
  setQuickCreateOpen,
  expandedItemId,
  setExpandedItemId,
  handleQuantityChange,
  handleDiscountChange,
  handleRemoveItem,
  totalQty,
  groupDiscountBanner,
  handleClearGroupDiscount,
  showCartDiscount,
  setShowCartDiscount,
  cartDiscountNum,
  cartDiscountMode,
  cartDiscountInput,
  applyCartDiscount,
  handleClearCartDiscountInput,
  totals,
  effectiveStoreId,
  handleOpenPaymentModal,
  grandTotalNum,
  onPriceOverride,
  pendingGate,
  handleGateGranted,
  handleGateClose,
  handleOpenPark,
  handleOpenRecall,
  handleReauthLine,
  handleReauthDiscount,
  handleOpenLinkRx,
  handleUnlinkRx,
  handleConsult,
  setCouponCode,
  redeemPoints,
  setRedeemPoints,
  loyaltyProgram,
  customerLoyaltyPoints,
}: CartPanelProps) {
  const reauthItems = cart.items.filter((i) => i.reauth);
  const needsReauth = reauthItems.length > 0 || !!cart.discountReauth;
  return (
    <>
      <Card padding={false} className="flex flex-col h-full">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary-600" />
              <h2 className="text-sm font-medium text-slate-800 dark:text-slate-100">Cart</h2>
              {cart.items.length > 0 && (
                <Badge variant="info" className="text-[10px] px-1.5">
                  {cart.items.length} item{cart.items.length !== 1 ? "s" : ""}
                  {totalQty !== cart.items.length && ` · ${totalQty} qty`}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {handleOpenRecall && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenRecall()}
                  className="text-xs h-7 px-2"
                  title="Recall a parked sale (F8)"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" /> Recall
                </Button>
              )}
              {cart.items.length > 0 && handleOpenPark && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenPark()}
                  className="text-xs h-7 px-2"
                  title="Park (suspend) this sale (F7)"
                >
                  <PauseCircle className="h-3.5 w-3.5" /> Park
                </Button>
              )}
              {cart.items.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearCart}
                  className="text-xs h-7 px-2"
                >
                  Clear All
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Select
              options={[
                { value: "", label: "Walk-in Customer" },
                ...customers.map((c) => ({
                  value: c.id,
                  label: `${c.name}${c.phone ? ` (${c.phone})` : ""}${
                    c.group && parseFloat(c.group.discountPercent) > 0
                      ? ` · ${c.group.discountPercent}% off`
                      : ""
                  }`,
                })),
              ]}
              value={cart.customerId || ""}
              onChange={(e) => handleCustomerChange(e.target.value || null)}
              className="flex-1 min-w-0"
            />
            <button
              onClick={() => setQuickCreateOpen(true)}
              className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-300 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-400/15 transition-colors"
              title="Quick add customer"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {cart.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 py-12">
              <ShoppingCart className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs text-slate-300 dark:text-slate-600 mt-0.5">
                Search or scan products to add
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                <span className="flex-1">Item</span>
                <span className="w-22 text-center">Qty</span>
                <span className="w-20 text-right">Total</span>
                <span className="w-6" />
              </div>

              {cart.items.map((item) => (
                <CartRow
                  key={item.id}
                  item={item}
                  isExpanded={expandedItemId === item.id}
                  onToggle={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}
                  onQuantity={(qty) => handleQuantityChange(item, qty)}
                  onDiscount={(d) => handleDiscountChange(item.id, d)}
                  onRemove={() => handleRemoveItem(item)}
                  onPriceOverride={onPriceOverride ? () => onPriceOverride(item) : undefined}
                  onLinkRx={handleOpenLinkRx ? () => handleOpenLinkRx(item) : undefined}
                  onUnlinkRx={handleUnlinkRx ? () => handleUnlinkRx(item) : undefined}
                  onConsult={handleConsult ? () => handleConsult(item) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {cart.items.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-800 p-3 space-y-2.5 shrink-0 bg-white dark:bg-slate-900">
            {needsReauth && (
              <div className="px-2.5 py-2 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 rounded-lg space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Manager re-authorization required before checkout
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {reauthItems.map((i) => (
                    <Button
                      key={i.id}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => handleReauthLine?.(i)}
                    >
                      Re-authorize “{i.name}”
                    </Button>
                  ))}
                  {cart.discountReauth && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => handleReauthDiscount?.()}
                    >
                      Re-authorize discount
                    </Button>
                  )}
                </div>
              </div>
            )}

            {groupDiscountBanner && (
              <div className="flex items-center gap-2 px-2.5 py-2 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-lg text-xs text-emerald-700 dark:text-emerald-300 animate-fade-in">
                <Tag className="h-3 w-3 shrink-0" />
                <span className="flex-1 font-medium">
                  {groupDiscountBanner.groupName} discount ({groupDiscountBanner.percent}%)
                  auto-applied
                </span>
                <button
                  onClick={handleClearGroupDiscount}
                  className="text-emerald-500 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-200 transition-colors shrink-0"
                  title="Remove group discount"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <button
              onClick={() => setShowCartDiscount(!showCartDiscount)}
              className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors w-full"
            >
              <Percent className="h-3 w-3" />
              {showCartDiscount ? "Hide" : "Add"} Cart Discount
              {cartDiscountNum > 0 && (
                <Badge variant="danger" className="text-[9px] ml-auto px-1.5">
                  -{formatMoney(cartDiscountNum)}
                </Badge>
              )}
            </button>

            {showCartDiscount && (
              <div className="flex items-center gap-2 animate-fade-in pb-1">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded p-0.5">
                  <button
                    onClick={() => applyCartDiscount(cartDiscountInput, "flat")}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                      cartDiscountMode === "flat"
                        ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    $ Flat
                  </button>
                  <button
                    onClick={() => applyCartDiscount(cartDiscountInput, "percent")}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                      cartDiscountMode === "percent"
                        ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    % Percent
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={cartDiscountInput}
                  onChange={(e) => applyCartDiscount(e.target.value, cartDiscountMode)}
                  className="flex-1 h-8 text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {cartDiscountNum > 0 && (
                  <button
                    onClick={handleClearCartDiscountInput}
                    className="text-xs text-danger-500 hover:underline shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {setRedeemPoints && loyaltyProgram?.isActive && cart.customerId && (
              <div className="mb-2">
                <RedeemPoints
                  availablePoints={customerLoyaltyPoints ?? 0}
                  redeemRate={Number(loyaltyProgram.redeemRate)}
                  minRedeemPoints={loyaltyProgram.minRedeemPoints}
                  grandTotal={totals.grandTotal.toNumber()}
                  applied={redeemPoints ?? 0}
                  onApply={setRedeemPoints}
                />
              </div>
            )}

            {setCouponCode && (
              <div className="mb-2">
                <CouponInput
                  onApplied={setCouponCode}
                  customerId={cart.customerId || undefined}
                  items={cart.items.map((i) => ({
                    productId: i.productId,
                    variantId: i.variantId || undefined,
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                    discount: i.discount,
                  }))}
                />
              </div>
            )}

            <CartTotals
              totals={totals}
              cartDiscountMode={cartDiscountMode}
              cartDiscountInput={cartDiscountInput}
            />

            <div className="relative group/charge">
              <Button
                className="w-full"
                size="lg"
                icon={<CreditCard className="h-5 w-5" />}
                disabled={!effectiveStoreId}
                onClick={handleOpenPaymentModal}
              >
                Charge {formatMoney(grandTotalNum)}
              </Button>

              {!effectiveStoreId && (
                <div
                  className={[
                    "pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20",
                    "opacity-0 group-hover/charge:opacity-100 transition-opacity duration-150",
                    "whitespace-nowrap rounded-lg bg-slate-800 px-3 py-1.5",
                    "text-[11px] font-medium text-white shadow-lg",
                  ].join(" ")}
                >
                  Select a store before charging
                  <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {pendingGate && (
        <OverrideGateModal
          open
          ctx={pendingGate.ctx}
          title={pendingGate.title}
          description={pendingGate.description}
          onClose={() => handleGateClose?.()}
          onGranted={(grant, authorizerUserId) => handleGateGranted?.(grant, authorizerUserId)}
        />
      )}
    </>
  );
}
