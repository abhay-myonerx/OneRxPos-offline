"use client";

import { Search, Package, Smartphone, Wifi, WifiOff, ScanBarcodeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { formatMoney } from "@/lib/currency/format-money";
import { ProductType } from "@/types/enums/status.enums";
import {
  getProductLevelStockState,
  getVariableProductAggregateStockState,
} from "@/features/pos/helpers/pos-stock";
import { StorePicker } from "@/features/pos/components/StorePicker";
import { NoStoreEmptyState } from "@/features/pos/components/NoStoreEmptyState";
import { Image } from "@/shell/media";
import type { RingUp, StockFilter } from "@/features/pos/hooks/useRingUp";

// ── ProductSearchGrid ────────────────────────────────────────────────────────
// Moved out of page.tsx (Phase 1.3a decomposition, Task 11) — the left column:
// StorePicker + barcode-scanner status + stock-filter pills + product tile
// grid. All state/handlers are owned by useRingUp; this component is
// presentational and takes them as props.

export type ProductSearchGridProps = Pick<
  RingUp,
  | "hasMultipleStores"
  | "storeIds"
  | "selectedStoreId"
  | "setSelectedStoreId"
  | "search"
  | "setSearch"
  | "scannerEnabled"
  | "setScannerEnabled"
  | "scanLoading"
  | "socketConnected"
  | "connectedScanners"
  | "isLoading"
  | "products"
  | "stockCounts"
  | "stockFilter"
  | "setStockFilter"
  | "effectiveStoreId"
  | "visibleProducts"
  | "getInCartQty"
  | "handleProductTileClick"
> & {
  /**
   * Ref to the underlying search `<input>`, so `page.tsx`'s `focusSearch`
   * hotkey (Task 12) can imperatively focus it without lifting search state
   * or DOM queries.
   */
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
};

export function ProductSearchGrid({
  hasMultipleStores,
  storeIds,
  selectedStoreId,
  setSelectedStoreId,
  search,
  setSearch,
  scannerEnabled,
  setScannerEnabled,
  scanLoading,
  socketConnected,
  connectedScanners,
  isLoading,
  products,
  stockCounts,
  stockFilter,
  setStockFilter,
  effectiveStoreId,
  visibleProducts,
  getInCartQty,
  handleProductTileClick,
  searchInputRef,
}: ProductSearchGridProps) {
  return (
    <div className="flex flex-col gap-3">
      {hasMultipleStores && (
        <StorePicker storeIds={storeIds} value={selectedStoreId} onChange={setSelectedStoreId} />
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            ref={searchInputRef}
            placeholder="Search products by name, SKU, barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="h-4 w-4" />}
            // Let the barcode scanner be captured even while this field is
            // focused. The useBarcodeScanner hook checks for this attribute
            // so scanner input is never swallowed by the search box.
            data-barcode-aware="true"
          />
        </div>
        <Button
          variant={scannerEnabled ? "primary" : "secondary"}
          size="icon"
          title={
            scannerEnabled ? "Barcode scanner active — click to disable" : "Enable barcode scanner"
          }
          aria-pressed={scannerEnabled}
          onClick={() => setScannerEnabled(!scannerEnabled)}
          icon={<ScanBarcodeIcon className="h-4 w-4" />}
        ></Button>
      </div>

      {scannerEnabled && (
        <div className="flex items-center gap-3 px-1 text-[11px] text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className={`relative flex h-1.5 w-1.5 shrink-0 ${scanLoading ? "" : ""}`}>
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${
                  scanLoading ? "bg-amber-400" : "bg-emerald-400"
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                  scanLoading ? "bg-amber-500" : "bg-emerald-500"
                }`}
              />
            </span>
            <span
              className={
                scanLoading
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }
            >
              {scanLoading ? "Looking up barcode…" : "Scanner ready"}
            </span>
          </span>

          <span className="text-slate-200 dark:text-slate-700">·</span>

          <span className="flex items-center gap-1">
            {socketConnected ? (
              <Wifi className="h-3 w-3 text-slate-400 dark:text-slate-500" />
            ) : (
              <WifiOff className="h-3 w-3 text-slate-300 dark:text-slate-600" />
            )}
            <Smartphone className="h-3 w-3" />
            <span
              className={
                socketConnected && connectedScanners.length > 0
                  ? "text-violet-600 dark:text-violet-400"
                  : ""
              }
            >
              {socketConnected
                ? connectedScanners.length > 0
                  ? `${connectedScanners.length} phone${connectedScanners.length !== 1 ? "s" : ""} connected`
                  : "Waiting for phone scanner…"
                : "Phone scanner offline"}
            </span>
          </span>
        </div>
      )}

      {!isLoading && products.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setStockFilter("in" as StockFilter)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
              stockFilter === "in"
                ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-300"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            In stock
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full tabular-nums ${
                stockFilter === "in"
                  ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
              }`}
            >
              {stockCounts.inStock}
            </span>
          </button>

          {stockCounts.outOfStock > 0 && (
            <button
              onClick={() => setStockFilter("out" as StockFilter)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                stockFilter === "out"
                  ? "bg-danger-50 border-danger-300 text-danger-700 dark:bg-danger-500/15 dark:border-danger-500/40 dark:text-danger-300"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              Out of stock
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full tabular-nums ${
                  stockFilter === "out"
                    ? "bg-danger-100 dark:bg-danger-500/20 text-danger-700 dark:text-danger-300"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                }`}
              >
                {stockCounts.outOfStock}
              </span>
            </button>
          )}

          {stockCounts.notStocked > 0 && (
            <button
              onClick={() => setStockFilter("ns" as StockFilter)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                stockFilter === "ns"
                  ? "bg-slate-100 dark:bg-slate-800 border-slate-400 dark:border-slate-600 text-slate-700 dark:text-slate-200"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              Not stocked
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full tabular-nums ${
                  stockFilter === "ns"
                    ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                }`}
              >
                {stockCounts.notStocked}
              </span>
            </button>
          )}

          <button
            onClick={() => setStockFilter("all" as StockFilter)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
              stockFilter === "all"
                ? "bg-primary-50 border-primary-300 text-primary-700 dark:bg-primary-400/15 dark:border-primary-500/40 dark:text-primary-300"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            All
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full tabular-nums ${
                stockFilter === "all"
                  ? "bg-primary-100 dark:bg-primary-400/20 text-primary-700 dark:text-primary-300"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
              }`}
            >
              {stockCounts.all}
            </span>
          </button>
        </div>
      )}

      {!effectiveStoreId ? (
        <NoStoreEmptyState />
      ) : isLoading ? (
        <Loading />
      ) : products.length === 0 ? (
        <Empty title="No products" message="Add products to start selling" />
      ) : visibleProducts.length === 0 ? (
        <Empty
          title={
            stockFilter === "in"
              ? "No products in stock"
              : stockFilter === "out"
                ? "No out-of-stock products"
                : "No untracked products"
          }
          message="Try a different filter or search"
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto lg:max-h-[calc(100vh-240px)]">
          {visibleProducts.map((p) => {
            const isVariable = p.productType === ProductType.VARIABLE;
            const state = isVariable
              ? getVariableProductAggregateStockState(p, effectiveStoreId)
              : getProductLevelStockState(p, effectiveStoreId);
            const inCart = getInCartQty(p.id, null);

            const isUntracked = state.kind === "untracked";
            const isUnlimited = state.kind === "unlimited";
            const trackedQty = state.kind === "tracked" ? state.quantity : 0;
            const remaining = state.kind === "tracked" ? trackedQty - inCart : Infinity;
            const isOut = state.kind === "tracked" && trackedQty <= 0;
            const isMaxed =
              !isVariable && state.kind === "tracked" && trackedQty > 0 && remaining <= 0;
            const isLow = !isVariable && state.kind === "tracked" && remaining > 0 && remaining <= 5;
            const disabled = isUntracked || isOut || (!isVariable && isMaxed);

            return (
              <button
                key={p.id}
                onClick={() => handleProductTileClick(p)}
                disabled={disabled}
                className={`bg-white dark:bg-slate-900 rounded-xl border p-3 text-left transition-all duration-150 group relative ${
                  disabled
                    ? "border-slate-200 dark:border-slate-800 opacity-50 cursor-not-allowed"
                    : "border-slate-200 dark:border-slate-800 hover:border-primary-300 dark:hover:border-primary-700"
                }`}
              >
                {p.image ? (
                  <div className="h-16 w-full rounded-lg overflow-hidden mb-2 bg-slate-50 dark:bg-slate-800">
                    <Image
                      src={p.image}
                      alt={p.name}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                      width={200}
                      height={200}
                    />
                  </div>
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-primary-50 dark:bg-primary-400/15 flex items-center justify-center mb-2 group-hover:bg-primary-100 dark:group-hover:bg-primary-400/25 transition-colors">
                    <Package className="h-5 w-5 text-primary-600 dark:text-primary-300" />
                  </div>
                )}
                <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate">
                  {p.name}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono">
                  {p.sku}
                </p>
                <p className="text-sm font-medium text-primary-700 dark:text-primary-300 mt-1.5">
                  {formatMoney(p.sellPrice)}
                </p>

                <div className="absolute top-2 right-2 flex flex-col items-end gap-0.5">
                  {isVariable && (
                    <span className="text-[9px] font-medium rounded px-1.5 py-0.5 bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300">
                      Variable
                    </span>
                  )}
                  {isUntracked ? (
                    <span className="text-[9px] font-medium rounded px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      Not stocked
                    </span>
                  ) : isUnlimited ? (
                    <span
                      className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300"
                      title="Unlimited stock"
                    >
                      ∞
                    </span>
                  ) : isVariable ? (
                    <span
                      className={`text-[9px] font-medium rounded px-1.5 py-0.5 tabular-nums ${
                        isOut
                          ? "bg-danger-100 dark:bg-danger-500/15 text-danger-700 dark:text-danger-300"
                          : "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      }`}
                      title="Stock is tracked per variant — tap to choose"
                    >
                      {isOut ? "Out of stock" : "Pick variant"}
                    </span>
                  ) : (
                    <span
                      className={`text-[9px] font-medium rounded px-1.5 py-0.5 tabular-nums ${
                        isOut
                          ? "bg-danger-100 dark:bg-danger-500/15 text-danger-700 dark:text-danger-300"
                          : isMaxed
                            ? "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : isLow
                              ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300"
                              : "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      }`}
                    >
                      {isOut ? "Out of stock" : isMaxed ? "In cart (max)" : `${remaining} left`}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
