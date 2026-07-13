"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, X, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/container";
import { formatMoney } from "@/lib/currency/format-money";
import { PaymentMethod } from "@/types/enums/status.enums";
import { getVariantStockState } from "@/features/pos/helpers/pos-stock";
import { cardAmountCents } from "@/features/pos/helpers/card-charge";
import { useTerminalPurchaseMutation } from "@/features/pos/payment-terminal.api";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ReceiptPreviewModal } from "@/features/receipt/components/ReceiptPreviewModal";
import { useRingUp } from "@/features/pos/hooks/useRingUp";
import { useRingUpHotkeys } from "@/features/pos/hooks/useRingUpHotkeys";
import { ProductSearchGrid } from "@/features/pos/components/ProductSearchGrid";
import { CartPanel } from "@/features/pos/components/CartPanel";
import { HotkeyHelpOverlay } from "@/features/pos/components/HotkeyHelpOverlay";
import { ManualBarcodeModal } from "@/features/pos/components/ManualBarcodeModal";
import { PriceOverrideModal } from "@/features/pos/components/PriceOverrideModal";
import { ManualItemModal } from "@/features/pos/components/ManualItemModal";
import { ParkSaleModal } from "@/features/pos/components/ParkSaleModal";
import { RecallSalesModal } from "@/features/pos/components/RecallSalesModal";
import { RecoverSaleBanner } from "@/features/pos/components/RecoverSaleBanner";
import { ScanPreviewModal } from "@/features/pos/components/ScanPreviewModal";
import { TillStatusBar } from "@/features/pos/shift/components/TillStatusBar";
import { LinkRxModal } from "@/features/pharmacy/components/LinkRxModal";

/**
 * POS terminal page — the primary selling interface.
 *
 * Left panel: product grid with stock-state filtering (in / out / not-stocked / all)
 * and dual barcode-scanner support (USB HID via useBarcodeScanner, phone/WebSocket
 * via useSocketScanner). Right panel: live cart with per-line and cart-level discounts,
 * split-payment modal, and post-sale receipt preview.
 *
 * Cart state lives in Redux (persists across navigation); totals are recomputed via
 * checkout-math.ts on every render so the UI always matches the backend's logic.
 *
 * Key flows:
 *  1. Cashier selects/scans a product → stock guard → addToCart dispatch
 *  2. Optional: select/quick-create customer → group discount auto-applied
 *  3. "Charge" opens payment modal; supports split payments across methods
 *  4. On successful checkout: cart cleared, receipt preview surfaced
 *
 * All orchestration (state + handlers) lives in `useRingUp` (Phase 1.3a
 * decomposition, Task 11) — this page is a thin composition of
 * `ProductSearchGrid` + `CartPanel`, plus the payment / quick-create /
 * variant-picker / receipt overlays.
 */
export default function PosPage() {
  const ringUp = useRingUp();
  const {
    cart,
    effectiveStoreId,
    grandTotalNum,
    totalDiscountNum,
    payments,
    setPayments,
    paymentModal,
    setPaymentModal,
    totalPaidNum,
    changeAmountNum,
    dueAmountNum,
    checkingOut,
    handleCheckout,
    handleOpenPaymentModal,
    handleClearCart,
    quickCreateOpen,
    setQuickCreateOpen,
    qcName,
    setQcName,
    qcPhone,
    setQcPhone,
    qcEmail,
    setQcEmail,
    qcGroupId,
    setQcGroupId,
    groups,
    creatingCustomer,
    handleQuickCreateCustomer,
    resetQuickCreateForm,
    variantPickerProduct,
    setVariantPickerProduct,
    handleAddVariantToCart,
    showReceipt,
    setShowReceipt,
    receiptSaleId,
    setReceiptSaleId,
    receiptInvoiceNo,
    setReceiptInvoiceNo,
    handleBarcodeScan,
    expandedItemId,
    priceOverrideItem,
    handleOpenPriceOverride,
    handleClosePriceOverride,
    // Suspend / resume (Phase 1.3b)
    handleOpenPark,
    doPark,
    parkModalOpen,
    setParkModalOpen,
    recallOpen,
    setRecallOpen,
    recallRecords,
    recallLoading,
    handleOpenRecall,
    doResume,
    handleDiscardParked,
    recoverMirror,
    handleRecoverActive,
    handleDiscardRecover,
    // Barcode Layer 2 (Phase 1.3c)
    scanPreview,
    handleScanPreviewConfirm,
    handleScanPreviewCancel,
    tillSession,
    // Pharmacy (Phase 2.2)
    linkRxItem,
    handleCloseLinkRx,
    handleRxLinked,
  } = ringUp;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showHotkeyHelp, setShowHotkeyHelp] = useState(false);
  const [showManualBarcode, setShowManualBarcode] = useState(false);
  const [showManualItem, setShowManualItem] = useState(false);

  // Semi-integrated card capture (Phase 2.10). If the tender includes a CARD
  // amount, collect it on the payment terminal FIRST — only an APPROVED result
  // proceeds to record the sale. Cash/gift/etc. skip the terminal. No card data
  // ever touches the app.
  const [terminalPurchase, { isLoading: charging }] = useTerminalPurchaseMutation();

  const handleCompleteSale = async () => {
    const amountCents = cardAmountCents(payments);
    if (amountCents > 0) {
      try {
        const result = await terminalPurchase({ amountCents }).unwrap();
        if (result.status !== "APPROVED") {
          showApiError(new Error(`Card ${result.status.toLowerCase()} — try another tender`));
          return;
        }
        showSuccess(
          `Card approved${result.cardType ? ` — ${result.cardType.replace(/_/g, " ")}` : ""}`,
        );
      } catch (err) {
        showApiError(err);
        return;
      }
    }
    await handleCheckout();
  };

  // `pay` mirrors the "Charge" button exactly: same guard (non-empty cart +
  // a selected store — CartPanel only renders the button once the cart has
  // items, and disables it while no store is selected) and the same action —
  // opening the payment modal, not checking out directly. The modal collects
  // payment and calls handleCheckout itself; wiring `pay` straight to
  // handleCheckout would hit its "insufficient payment" guard before any
  // payment had been entered.
  // manualBarcode (F3) opens the manual-entry modal (Task 13); its submit
  // routes through the SAME handleBarcodeScan the USB/socket scanners use.
  // priceOverride (F2, Task 14) targets the currently expanded/selected
  // line (CartRow's onToggle sets expandedItemId) — no-op if no line is
  // expanded. manualItem (F4, Task 15) opens the gated open-price/misc item
  // modal. The remaining actions (voidLine/qty/nav) are wired in Task 16;
  // left unmapped here, the dispatcher no-ops.
  //
  // Wrapped in useMemo so the handlers object is stable across unrelated
  // re-renders — useRingUpHotkeys tears down/re-adds its global `keydown`
  // listener whenever this object changes identity.
  const hotkeyHandlers = useMemo(
    () => ({
      pay: () => {
        if (cart.items.length > 0 && effectiveStoreId) handleOpenPaymentModal();
      },
      focusSearch: () => searchInputRef.current?.focus(),
      clearTransaction: handleClearCart,
      help: () => setShowHotkeyHelp((v) => !v),
      manualBarcode: () => setShowManualBarcode(true),
      manualItem: () => setShowManualItem(true),
      priceOverride: () => {
        const item = cart.items.find((i) => i.id === expandedItemId);
        if (item) handleOpenPriceOverride(item);
      },
      parkSale: handleOpenPark,
      recallSale: () => {
        void handleOpenRecall();
      },
    }),
    [
      cart.items,
      effectiveStoreId,
      handleOpenPaymentModal,
      handleClearCart,
      expandedItemId,
      handleOpenPriceOverride,
      handleOpenPark,
      handleOpenRecall,
    ],
  );

  useRingUpHotkeys(hotkeyHandlers);

  return (
    <>
      <PageHeader title="Point of Sale" />

      <div className="mb-3">
        <TillStatusBar session={tillSession} disabled={!effectiveStoreId} />
      </div>

      <div className="pos-grid">
        <ProductSearchGrid {...ringUp} searchInputRef={searchInputRef} />
        <CartPanel {...ringUp} onPriceOverride={handleOpenPriceOverride} />
      </div>

      <Modal
        open={paymentModal}
        onClose={() => setPaymentModal(false)}
        title="Process Payment"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-primary-50 dark:bg-primary-400/15 rounded-xl p-4 text-center">
            <p className="text-sm text-primary-600 dark:text-primary-300 font-medium">Total Due</p>
            <p className="text-3xl font-medium text-primary-800 dark:text-primary-200">
              {formatMoney(grandTotalNum)}
            </p>
            {totalDiscountNum > 0 && (
              <p className="text-xs text-primary-500 dark:text-primary-400 mt-1">
                Includes {formatMoney(totalDiscountNum)} discount
              </p>
            )}
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 max-h-32 overflow-y-auto">
            <div className="space-y-1">
              {cart.items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between text-xs text-slate-600 dark:text-slate-300"
                >
                  <span className="truncate flex-1 mr-2">
                    {item.name} × {item.quantity}
                  </span>
                  <span className="tabular-nums shrink-0">
                    {formatMoney(item.unitPrice * item.quantity - item.discount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {payments.map((p, i) => (
            <div key={i} className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
                  Method
                </label>
                <Select
                  options={Object.values(PaymentMethod).map((m) => ({
                    value: m,
                    label: m.replace("_", " "),
                  }))}
                  value={p.method}
                  onChange={(e) => {
                    const updated = [...payments];
                    updated[i] = {
                      ...updated[i],
                      method: e.target.value as PaymentMethod,
                    };
                    setPayments(updated);
                  }}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
                  Amount
                </label>
                <Input
                  type="number"
                  value={p.amount || ""}
                  onChange={(e) => {
                    const updated = [...payments];
                    updated[i] = {
                      ...updated[i],
                      amount: parseFloat(e.target.value) || 0,
                    };
                    setPayments(updated);
                  }}
                />
              </div>
              {payments.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPayments(payments.filter((_, j) => j !== i))}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-300">
            <span>Total Tendered</span>
            <span className="tabular-nums font-medium">{formatMoney(totalPaidNum)}</span>
          </div>

          {changeAmountNum > 0 && (
            <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-500/15 rounded-lg px-4 py-2.5 border border-emerald-200 dark:border-emerald-500/30">
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Change Due (cash)
              </span>
              <span className="text-lg font-medium text-emerald-700 dark:text-emerald-300 tabular-nums">
                {formatMoney(changeAmountNum)}
              </span>
            </div>
          )}

          {dueAmountNum > 0 && (
            <div className="flex justify-between items-center bg-amber-50 dark:bg-amber-500/15 rounded-lg px-4 py-2.5 border border-amber-200 dark:border-amber-500/30">
              <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Amount Still Due
              </span>
              <span className="text-lg font-medium text-amber-700 dark:text-amber-300 tabular-nums">
                {formatMoney(dueAmountNum)}
              </span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPayments([...payments, { method: PaymentMethod.CASH, amount: 0 }])}
          >
            <Plus className="h-4 w-4" /> Split Payment
          </Button>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button
              className="w-full"
              size="lg"
              loading={checkingOut || charging}
              disabled={dueAmountNum > 0}
              onClick={handleCompleteSale}
              icon={<Receipt className="h-5 w-5" />}
            >
              {charging ? "Charging card…" : "Complete Sale"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={quickCreateOpen}
        onClose={() => {
          setQuickCreateOpen(false);
          resetQuickCreateForm();
        }}
        title="Quick Add Customer"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Name <span className="text-danger-500">*</span>
            </label>
            <Input
              placeholder="Customer name"
              value={qcName}
              onChange={(e) => setQcName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQuickCreateCustomer()}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Phone
            </label>
            <Input
              placeholder="+1 555 000 0000"
              value={qcPhone}
              onChange={(e) => setQcPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQuickCreateCustomer()}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Email
            </label>
            <Input
              type="email"
              placeholder="customer@example.com"
              value={qcEmail}
              onChange={(e) => setQcEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQuickCreateCustomer()}
            />
          </div>
          {groups.length > 0 && (
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
                Customer Group
              </label>
              <Select
                options={[
                  { value: "", label: "No group" },
                  ...groups.map((g) => ({
                    value: g.id,
                    label: `${g.name}${
                      parseFloat(g.discountPercent) > 0 ? ` (${g.discountPercent}% off)` : ""
                    }`,
                  })),
                ]}
                value={qcGroupId}
                onChange={(e) => setQcGroupId(e.target.value)}
              />
            </div>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Customer info will appear on the receipt and be saved for future transactions.
          </p>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="outline"
              onClick={() => {
                setQuickCreateOpen(false);
                resetQuickCreateForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleQuickCreateCustomer}
              loading={creatingCustomer}
              disabled={!qcName.trim()}
            >
              Create &amp; Select
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={variantPickerProduct !== null}
        onClose={() => setVariantPickerProduct(null)}
        title={
          variantPickerProduct ? `Choose variant — ${variantPickerProduct.name}` : "Choose variant"
        }
        size="md"
      >
        {variantPickerProduct && (
          <div className="space-y-2 max-h-[min(70vh,420px)] overflow-y-auto pr-0.5">
            {(variantPickerProduct.variants?.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                This product has no variants configured.
              </p>
            ) : (
              (variantPickerProduct.variants ?? []).map((v) => {
                const st = getVariantStockState(v, effectiveStoreId);
                const qtyLabel =
                  st.kind === "untracked"
                    ? "Not stocked at this store"
                    : st.kind === "unlimited"
                      ? "∞ in stock"
                      : `${st.quantity} in stock`;
                const canAdd =
                  v.isActive &&
                  (st.kind === "unlimited" || (st.kind === "tracked" && st.quantity > 0));

                return (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {v.name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                        {v.sku}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {qtyLabel}
                        {!v.isActive && <span className="text-danger-600 ml-1">· Inactive</span>}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={!canAdd}
                      onClick={() => handleAddVariantToCart(variantPickerProduct, v)}
                    >
                      Add
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </Modal>

      <ReceiptPreviewModal
        open={showReceipt}
        onClose={() => {
          setShowReceipt(false);
          setReceiptSaleId(null);
          setReceiptInvoiceNo("");
        }}
        saleId={receiptSaleId}
        invoiceNo={receiptInvoiceNo}
      />

      <HotkeyHelpOverlay open={showHotkeyHelp} onClose={() => setShowHotkeyHelp(false)} />

      <ManualBarcodeModal
        open={showManualBarcode}
        onClose={() => setShowManualBarcode(false)}
        onSubmit={handleBarcodeScan}
      />

      {showManualItem && (
        <ManualItemModal open onClose={() => setShowManualItem(false)} />
      )}

      {priceOverrideItem && (
        <PriceOverrideModal
          line={priceOverrideItem}
          open
          onClose={handleClosePriceOverride}
          onApplied={handleClosePriceOverride}
        />
      )}

      <ParkSaleModal
        open={parkModalOpen}
        onClose={() => setParkModalOpen(false)}
        onPark={doPark}
      />

      <RecallSalesModal
        open={recallOpen}
        onClose={() => setRecallOpen(false)}
        records={recallRecords}
        loading={recallLoading}
        onResume={doResume}
        onDiscard={handleDiscardParked}
        activeCartNonEmpty={cart.items.length > 0}
      />

      <RecoverSaleBanner
        mirror={recoverMirror}
        onRecover={handleRecoverActive}
        onDiscard={handleDiscardRecover}
      />

      <ScanPreviewModal
        preview={scanPreview}
        onConfirm={handleScanPreviewConfirm}
        onCancel={handleScanPreviewCancel}
      />

      <LinkRxModal
        open={!!linkRxItem}
        onClose={handleCloseLinkRx}
        onLink={handleRxLinked}
        productName={linkRxItem?.name}
      />
    </>
  );
}
