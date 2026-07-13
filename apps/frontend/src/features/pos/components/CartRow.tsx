"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Minus, Plus, X, Tag, DollarSign } from "lucide-react";
import { formatMoney } from "@/lib/currency/format-money";
import type { CartItem } from "@/features/pos/types/cart.types";

// ── CartRow ──────────────────────────────────────────────────────────────────
// Moved out of page.tsx (Phase 1.3a decomposition, Task 10) — behavior/props
// unchanged, still tightly coupled to the cart slice's CartItem shape.

export interface CartRowProps {
  item: CartItem;
  isExpanded: boolean;
  onToggle: () => void;
  onQuantity: (qty: number) => void;
  onDiscount: (d: number) => void;
  onRemove: () => void;
  /** Opens PriceOverrideModal for this line (Phase 1.3a, Task 14). Optional
   * so existing render call sites/tests that don't need it are unaffected. */
  onPriceOverride?: () => void;
  /** Pharmacy schedule enforcement (Phase 2.2). Optional. */
  onLinkRx?: () => void;
  onUnlinkRx?: () => void;
  onConsult?: () => void;
}

export function CartRow({
  item,
  isExpanded,
  onToggle,
  onQuantity,
  onDiscount,
  onRemove,
  onPriceOverride,
  onLinkRx,
  onUnlinkRx,
  onConsult,
}: CartRowProps) {
  const needsRx = item.scheduleCategory === "NEEDS_RX" || item.scheduleCategory === "NARCOTIC";
  const behindCounter = item.scheduleCategory === "BEHIND_COUNTER";
  const rxMissing = needsRx && !item.rx;
  const consultMissing = behindCounter && !item.consultAck;
  // lineTotal is a display value only — checkout-math recomputes authoritative totals
  const lineTotal = item.unitPrice * item.quantity - item.discount;
  // maxStock === 999 is the sentinel for "unlimited / untracked" stock
  const isUnlimited = item.maxStock >= 999;
  const atMax = !isUnlimited && item.quantity >= item.maxStock;
  const remaining = isUnlimited ? Infinity : item.maxStock - item.quantity;
  const [discountMode, setDiscountMode] = useState<"flat" | "percent">("flat");
  const [discountInput, setDiscountInput] = useState(
    item.discount > 0 ? String(item.discount) : "",
  );

  // Keyboard-editable quantity (Task 13). Buffered in local state rather than
  // driven directly off item.quantity so the cashier can clear the field and
  // type a fresh multi-digit value without each keystroke's intermediate
  // (invalid) state snapping the input back to "1". Committed on blur/Enter;
  // re-synced from item.quantity whenever it changes from elsewhere (the
  // +/- buttons, or the stock-guard clamp in useRingUp's handleQuantityChange).
  const [qtyInput, setQtyInput] = useState(String(item.quantity));
  useEffect(() => {
    setQtyInput(String(item.quantity));
  }, [item.quantity]);

  const commitQtyInput = () => {
    const parsed = parseInt(qtyInput, 10);
    const clamped = Number.isNaN(parsed)
      ? item.quantity
      : Math.max(1, Math.min(parsed, item.maxStock));
    setQtyInput(String(clamped));
    if (clamped !== item.quantity) onQuantity(clamped);
  };

  // Convert the user's input (flat or %) to an absolute discount amount and
  // clamp it so the line can never go negative.
  const applyDiscount = (val: string, mode: "flat" | "percent") => {
    setDiscountInput(val);
    const num = parseFloat(val) || 0;
    if (mode === "percent") {
      const flat = (item.unitPrice * item.quantity * num) / 100;
      onDiscount(Math.min(flat, item.unitPrice * item.quantity));
    } else {
      onDiscount(Math.min(num, item.unitPrice * item.quantity));
    }
  };

  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
        <button onClick={onToggle} className="flex-1 min-w-0 text-left flex items-center gap-1.5">
          <ChevronDown
            className={`h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate leading-tight">
              {item.name}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
              {formatMoney(item.unitPrice)} × {item.quantity}
              {item.discount > 0 && (
                <span className="text-danger-500 ml-1">-{formatMoney(item.discount)}</span>
              )}
              {!isUnlimited && (
                <span
                  className={`ml-1.5 font-medium ${
                    atMax
                      ? "text-danger-500"
                      : remaining <= 5
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  · {atMax ? "Max reached" : `${remaining} left`}
                </span>
              )}
              {rxMissing && <span className="ml-1.5 font-medium text-danger-500">· Rx required</span>}
              {item.rx && (
                <span className="ml-1.5 font-medium text-primary-600 dark:text-primary-300">
                  · Rx #{item.rx.rxNumber}
                </span>
              )}
              {consultMissing && <span className="ml-1.5 font-medium text-amber-600 dark:text-amber-400">· Consult</span>}
              {item.consultAck && <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">· Consult ✓</span>}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => onQuantity(item.quantity - 1)}
            className="h-6 w-6 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Minus className="h-2.5 w-2.5 text-slate-600 dark:text-slate-300" />
          </button>
          <input
            type="number"
            min={1}
            max={item.maxStock}
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            onBlur={commitQtyInput}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="w-8 h-6 text-center text-xs font-medium text-slate-800 dark:text-slate-100 bg-transparent border-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={() => onQuantity(item.quantity + 1)}
            disabled={atMax}
            className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${
              atMax
                ? "bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed opacity-40"
                : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            <Plus className="h-2.5 w-2.5 text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100 w-20 text-right tabular-nums shrink-0">
          {formatMoney(lineTotal)}
        </p>

        <button
          onClick={onRemove}
          className="h-6 w-6 rounded flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-500/15 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {isExpanded && (
        <div className="px-3 pb-2.5 pt-0.5 ml-6 animate-fade-in">
          <div className="flex items-center gap-2">
            <Tag className="h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0" />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
              Discount:
            </span>

            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded p-0.5">
              <button
                onClick={() => {
                  setDiscountMode("flat");
                  applyDiscount(discountInput, "flat");
                }}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  discountMode === "flat"
                    ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                $
              </button>
              <button
                onClick={() => {
                  setDiscountMode("percent");
                  applyDiscount(discountInput, "percent");
                }}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  discountMode === "percent"
                    ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                %
              </button>
            </div>

            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="0"
              value={discountInput}
              onChange={(e) => applyDiscount(e.target.value, discountMode)}
              className="w-16 h-6 text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />

            {item.discount > 0 && (
              <button
                onClick={() => {
                  setDiscountInput("");
                  onDiscount(0);
                }}
                className="text-[10px] text-danger-500 hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
            <span>SKU: {item.sku}</span>
            <span>Stock: {item.maxStock === 999 ? "∞" : item.maxStock}</span>
          </div>

          {onPriceOverride && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <button
                onClick={onPriceOverride}
                aria-label="Override price"
                className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-300 transition-colors"
              >
                <DollarSign className="h-3 w-3" />
                Override price
              </button>
              {item.priceOverride && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                  · Manager override applied
                </span>
              )}
            </div>
          )}

          {/* Pharmacy: link an Rx / pharmacist consult (Phase 2.2) */}
          {needsRx && (
            <div className="flex items-center gap-2 mt-1.5">
              {item.rx ? (
                <>
                  <span className="text-[10px] text-primary-600 dark:text-primary-300 font-medium">
                    Rx #{item.rx.rxNumber}
                    {item.rx.copay != null ? ` · ${formatMoney(item.rx.copay)}` : ""}
                  </span>
                  {onUnlinkRx && (
                    <button onClick={onUnlinkRx} className="text-[10px] text-danger-500 hover:underline">
                      Unlink
                    </button>
                  )}
                </>
              ) : (
                onLinkRx && (
                  <button
                    onClick={onLinkRx}
                    className="text-[10px] font-medium text-danger-600 dark:text-danger-400 hover:underline"
                  >
                    Link prescription (required)
                  </button>
                )
              )}
            </div>
          )}
          {behindCounter && (
            <div className="flex items-center gap-2 mt-1.5">
              {item.consultAck ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  Pharmacist consult recorded
                </span>
              ) : (
                onConsult && (
                  <button
                    onClick={onConsult}
                    className="text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    Pharmacist consult (required)
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
