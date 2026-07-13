/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  useListProductsQuery,
  useLazyLookupByBarcodeQuery,
} from "@/features/products/api/products.api";
import {
  useListCustomersQuery,
  useGetLoyaltyProgramQuery,
  useCreateCustomerMutation,
  useListGroupsQuery,
} from "@/features/customers/api/customers.api";
import { useCheckoutMutation } from "@/features/sales/api/sales.api";
import { usePrintSaleReceiptMutation } from "@/features/receipt/api/receipt.api";
import { computeCartTotals, computeChange } from "@/features/pos/helpers/checkout-math";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import {
  addToCart,
  updateQuantity,
  updateDiscount,
  setCustomer,
  setStoreProvince,
  clearCart,
  voidLine,
  setDiscountOverride,
  replaceCart,
  resolveLineReauth,
  addMiscItem,
  linkRx,
  unlinkRx,
  setConsult,
  setLineSchedule,
} from "@/features/pos/state/cart.slice";
import {
  priceOverrideCtx,
  discountOverCapCtx,
  openPriceItemCtx,
  voidLineCtx,
  voidTransactionCtx,
  type OverrideRequest,
} from "@/features/pos/helpers/override-context";
import { exceedsCap, DEFAULT_ROLE_CAPS } from "@/features/pos/helpers/discount-cap";
import { useConsumeOverrideMutation, useGetMiscProductQuery } from "@/features/pos/api/pos.api";
import { useGetMeQuery } from "@/features/auth/api/auth.api";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useSocketScanner } from "@/hooks/useSocketScanner";
import { PaymentMethod, ProductType } from "@/types/enums/status.enums";
import type { CheckoutPayment } from "@/features/pos/types/checkout.types";
import type { CartItem } from "@/features/pos/types/cart.types";
import type { Product, ProductVariant } from "@/features/products/types/product.types";
import {
  getProductLevelStockState,
  getVariantStockState,
  getVariableProductAggregateStockState,
  getPosListingStockState,
} from "@/features/pos/helpers/pos-stock";
import { getActiveLevies } from "@/features/pos/helpers/product-tax";
import { useGetStoreQuery } from "@/features/stores/api/stores.api";
import {
  serializeSnapshot,
  deserializeSnapshot,
  snapshotNeedsReauth,
} from "@/features/pos/helpers/parked-snapshot";
import { mergeRecallList } from "@/features/pos/helpers/recall-merge";
import { getParkedSaleStore } from "@/features/pos/persistence/parked-sale-store";
import type { ActiveCartMirror } from "@/features/pos/persistence/parked-sale-store";
import type { ParkedSaleRecord } from "@/features/pos/types/parked-sale.types";
import {
  useMirrorParkedSaleMutation,
  useLazyListRemoteParkedSalesQuery,
  useClaimParkedSaleMutation,
  useDiscardParkedSaleMutation,
} from "@/features/pos/api/pos.api";
import { useRef } from "react";
import type { TaxCategory } from "rx-pos-shared";
import { decodeBarcode } from "@/features/pos/barcode/decode";
import { useListBarcodeTemplatesQuery } from "@/features/pos/barcode/barcode.api";
import { useTillSession } from "@/features/pos/shift/useTillSession";
import { useLazyGetDrugProductQuery } from "@/features/pharmacy/drug.api";
import {
  enqueueOfflineAction,
  dequeueOfflineAction,
} from "@/features/pos/state/offline-queue.slice";
import type { MirrorParkedSaleRequest } from "@/features/pos/api/pos.api";

export type StockFilter = "in" | "out" | "ns" | "all";

/**
 * A decoded priced/Rx scan awaiting the cashier's confirm (Phase 1.3c). Non-null
 * while `ScanPreviewModal` is shown — the "never ring a wrong amount" safety gate
 * for GS1 embedded-price / Rx-label copay scans (plain product scans skip it).
 */
export interface ScanPreview {
  kind: "gs1" | "rx";
  title: string;
  price: number;
  weightKg?: number;
  gtin?: string;
  rxNumber?: string;
  patient?: string;
  taxCategory?: TaxCategory;
}

// Gated-action prompt (Phase 1.3a, Task 16) — non-null while an
// `OverrideGateModal` should be showing for a discount-cap-exceeding
// discount or a line-void/clear-transaction. `onGranted` is the
// action-specific continuation (apply the discount / consume + void /
// consume + clear) invoked once the PIN-verified grant comes back.
export interface PendingGate {
  ctx: OverrideRequest;
  title: string;
  description?: string;
  onGranted: (grant: string, authorizerUserId: string) => void | Promise<void>;
}

/**
 * Ring-up orchestration hook — extracted from `pos/page.tsx` (Phase 1.3a
 * decomposition, Task 11). Owns all local state, derived data, and handlers
 * for the POS terminal: product search/scan, stock guards, cart mutation,
 * customer selection/quick-create, cart-level discount, and checkout.
 *
 * Behavior-preserving move only — logic is unchanged from the monolithic
 * page; only the container changed. `page.tsx` composes `ProductSearchGrid`
 * + `CartPanel` (+ modals) from this hook's return value.
 *
 * Key flows:
 *  1. Cashier selects/scans a product → stock guard → addToCart dispatch
 *  2. Optional: select/quick-create customer → group discount auto-applied
 *  3. "Charge" opens payment modal; supports split payments across methods
 *  4. On successful checkout: cart cleared, receipt preview surfaced
 */
export function useRingUp() {
  const dispatch = useAppDispatch();
  const cart = useAppSelector((s) => s.cart);
  const user = useAppSelector((s) => s.auth.user);
  // Parked-sale mirror writes that failed while offline (1.3b follow-up).
  // Optional-chained so minimal test stores without the slice don't crash.
  const offlineQueueItems = useAppSelector((s) => s.offlineQueue?.items ?? []);

  const [search, setSearch] = useState("");
  const [paymentModal, setPaymentModal] = useState(false);
  const [payments, setPayments] = useState<CheckoutPayment[]>([
    { method: PaymentMethod.CASH, amount: 0 },
  ]);

  const [cartDiscount, setCartDiscount] = useState(0);
  const [cartDiscountMode, setCartDiscountMode] = useState<"flat" | "percent">("flat");
  const [cartDiscountInput, setCartDiscountInput] = useState("");
  // 3H.4 — optional coupon code applied server-side at checkout.
  const [couponCode, setCouponCode] = useState<string | null>(null);
  // 3H.5 — loyalty points to redeem as a tender at checkout.
  const [redeemPoints, setRedeemPoints] = useState<number>(0);
  const [showCartDiscount, setShowCartDiscount] = useState(false);

  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Gated line price-override (Phase 1.3a, Task 14) — the line currently
  // targeted by the `priceOverride` hotkey or a per-line control. Non-null
  // while `PriceOverrideModal` is open for that line.
  const [priceOverrideItem, setPriceOverrideItem] = useState<CartItem | null>(null);

  const [receiptSaleId, setReceiptSaleId] = useState<string | null>(null);
  const [receiptInvoiceNo, setReceiptInvoiceNo] = useState<string>("");
  const [showReceipt, setShowReceipt] = useState(false);

  // Discount-cap + void/clear gating (Phase 1.3a, Task 16). Non-null while
  // `OverrideGateModal` should prompt for a manager PIN before an over-cap
  // discount, a line void, or a cart clear takes effect.
  const [pendingGate, setPendingGate] = useState<PendingGate | null>(null);

  // Suspend / resume (Phase 1.3b). Parked holds live in the device's IndexedDB
  // (authoritative) mirrored best-effort to the backend; the active cart is
  // continuously mirrored for crash recovery.
  const parkedStore = useMemo(() => getParkedSaleStore(), []);
  const [mirrorParkedSale] = useMirrorParkedSaleMutation();
  const [triggerListRemote] = useLazyListRemoteParkedSalesQuery();
  const [claimParkedSale] = useClaimParkedSaleMutation();
  const [discardParkedSale] = useDiscardParkedSaleMutation();
  const [parkModalOpen, setParkModalOpen] = useState(false);
  const [recallOpen, setRecallOpen] = useState(false);
  const [recallRecords, setRecallRecords] = useState<ParkedSaleRecord[]>([]);
  const [recallLoading, setRecallLoading] = useState(false);
  const [recoverMirror, setRecoverMirror] = useState<ActiveCartMirror | null>(null);
  // Guards the mirror effect from clobbering a recoverable snapshot before the
  // boot-time recovery check has resolved.
  const recoveryResolvedRef = useRef(false);

  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [qcName, setQcName] = useState("");
  const [qcPhone, setQcPhone] = useState("");
  const [qcEmail, setQcEmail] = useState("");
  const [qcGroupId, setQcGroupId] = useState("");

  // Multi-store users choose a store at runtime; single-store users are bound
  // to their assigned store. The picker persists the last choice to localStorage
  // so a cashier doesn't have to re-select on every session.
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(() => {
    if (user?.storeId) return user.storeId;
    try {
      const saved = localStorage.getItem("pos_selected_store_id");
      if (saved && Array.isArray((user as any)?.storeIds)) {
        const allowed: string[] = (user as any).storeIds;
        // Validate the saved value is still in the user's allowed list
        if (allowed.includes(saved)) return saved;
      }
    } catch {
      // localStorage blocked in private browsing — degrade gracefully
    }
    return null;
  });

  // Single source of truth for the active store across both the product grid
  // and all stock-guard checks.
  const effectiveStoreId = selectedStoreId ?? user?.storeId ?? null;

  // Till session (Phase 1.4): the caller's open cashier shift at this store.
  // Gates checkout (no open till → can't charge) and supplies the sale's shiftId.
  const tillSession = useTillSession(effectiveStoreId);

  // Resolve the active store's province and mirror it into the cart slice —
  // computeCartTotals (and ultimately the backend) needs it to select the
  // correct tax profile. Kept in sync via effect rather than fetched inline in
  // the totals memo, since the store record is a separate query.
  const { data: activeStore } = useGetStoreQuery(effectiveStoreId ?? "", {
    skip: !effectiveStoreId,
  });
  useEffect(() => {
    dispatch(setStoreProvince(effectiveStoreId ? (activeStore?.province ?? null) : null));
  }, [dispatch, effectiveStoreId, activeStore?.province]);

  // Default to "in stock" so cashiers see actionable products immediately
  const [stockFilter, setStockFilter] = useState<StockFilter>("in");

  const [groupDiscountBanner, setGroupDiscountBanner] = useState<{
    groupName: string;
    percent: string;
  } | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: productData, isLoading } = useListProductsQuery({
    search,
    limit: 50,
    isActive: true,
    storeId: effectiveStoreId ?? undefined,
  });
  const { data: customerData } = useListCustomersQuery({ limit: 100 });
  const { data: groupsData } = useListGroupsQuery();
  const [createCustomer, { isLoading: creatingCustomer }] = useCreateCustomerMutation();
  const [checkout, { isLoading: checkingOut }] = useCheckoutMutation();
  const [printSaleReceipt] = usePrintSaleReceiptMutation();
  // Lazy so we can call it imperatively on each scan event rather than on mount
  const [lookupBarcode, { isFetching: scanLoading }] = useLazyLookupByBarcodeQuery();
  // Verify+consume+audit a manager-override grant for void-line/clear-cart
  // (Phase 1.3a, Task 16) — these never reach a persisted sale, so they're
  // audited at action time rather than riding along on checkout's overrides[].
  const [consumeOverride] = useConsumeOverrideMutation();
  // Barcode Layer 2 (Phase 1.3c): the tenant's learned label templates, fetched
  // once and fed into the pure decode pipeline; and the tenant Misc product used
  // to ring an Rx/weighted line at a label-decoded price (via the confirm preview).
  const { data: templatesData } = useListBarcodeTemplatesQuery();
  const templates = useMemo(() => templatesData ?? [], [templatesData]);
  const { data: miscProduct } = useGetMiscProductQuery();
  const [scanPreview, setScanPreview] = useState<ScanPreview | null>(null);
  // Pharmacy schedule enforcement (Phase 2.2): resolve each drug line's schedule
  // from its DIN, and drive the link-Rx / consult flow.
  const [triggerGetDrug] = useLazyGetDrugProductQuery();
  const [linkRxItem, setLinkRxItem] = useState<CartItem | null>(null);
  // Lines that block checkout until an Rx is linked / a consult is authorized
  // (Phase 2.2). Client-side hint; the backend compliance hook is authoritative.
  const pharmacyBlockers = cart.items.filter((i) => {
    if (i.scheduleCategory === "NEEDS_RX" || i.scheduleCategory === "NARCOTIC") return !i.rx;
    if (i.scheduleCategory === "BEHIND_COUNTER") return !i.consultAck;
    return false;
  });
  // `/auth/me`'s `discountCaps` (Task 7 backend) — the one settings surface
  // every authenticated role (including CASHIER) already fetches on session
  // bootstrap, unlike the ADMIN-only tenant-settings endpoint. Falls back to
  // the code defaults if the fetch hasn't resolved yet (or in tests, where
  // it's mocked away entirely).
  const { data: meData } = useGetMeQuery();
  const discountCaps = meData?.discountCaps ?? DEFAULT_ROLE_CAPS;
  const actingRole = user?.role ?? "CASHIER";

  // ── Derived state ─────────────────────────────────────────────────────────

  // Memoised so filtering / stock badge renders don't re-evaluate on every
  // keystroke in unrelated fields.
  const products = useMemo(() => productData?.data || [], [productData?.data]);
  const customers = customerData?.data || [];
  const groups = groupsData || [];
  // 3H.5 loyalty redemption: the program config + the selected customer's points.
  const { data: loyaltyProgram } = useGetLoyaltyProgramQuery();
  const customerLoyaltyPoints = customers.find((c) => c.id === cart.customerId)?.loyaltyPoints ?? 0;

  const [scannerEnabled, setScannerEnabled] = useState(true);
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);

  // Counts for the filter pill badges — only re-evaluates when the product list
  // or active store changes, not on every cart update or keystroke.
  const stockCounts = useMemo(() => {
    let inStock = 0,
      outOfStock = 0,
      notStocked = 0;
    for (const p of products) {
      const s = getPosListingStockState(p, effectiveStoreId);
      if (s.kind === "untracked") notStocked++;
      else if (s.kind === "unlimited") inStock++;
      else if (s.quantity > 0) inStock++;
      else outOfStock++;
    }
    return { inStock, outOfStock, notStocked, all: products.length };
  }, [products, effectiveStoreId]);

  // Filter the product grid client-side to avoid a round-trip on every pill click.
  // The full unfiltered list is already in memory from the initial query.
  const visibleProducts = useMemo(() => {
    if (stockFilter === "all") return products;
    return products.filter((p) => {
      const s = getPosListingStockState(p, effectiveStoreId);
      if (stockFilter === "in")
        return s.kind === "unlimited" || (s.kind === "tracked" && s.quantity > 0);
      if (stockFilter === "out") return s.kind === "tracked" && s.quantity <= 0;
      if (stockFilter === "ns") return s.kind === "untracked";
      return true;
    });
  }, [products, stockFilter, effectiveStoreId]);

  // Returns how many units of a given product+variant are already in the cart.
  // Used to enforce the stock ceiling guard before dispatching addToCart.
  const getInCartQty = useCallback(
    (productId: string, variantId: string | null) =>
      cart.items
        .filter((i) => i.productId === productId && (i.variantId ?? null) === (variantId ?? null))
        .reduce((s, i) => s + i.quantity, 0),
    [cart.items],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  // When a customer with a group discount is selected, auto-apply that
  // discount as a cart-level percent. Switching to a customer without a group
  // discount (or clearing the customer) removes the auto-applied discount so
  // the cashier isn't left with a stale group rate on an anonymous sale.
  const handleCustomerChange = (customerId: string | null) => {
    dispatch(setCustomer(customerId));

    if (!customerId) {
      if (groupDiscountBanner) {
        setCartDiscount(0);
        setCartDiscountInput("");
        setShowCartDiscount(false);
        setGroupDiscountBanner(null);
      }
      return;
    }

    const customer = customers.find((c) => c.id === customerId);
    const discPct = parseFloat(customer?.group?.discountPercent ?? "0");

    if (discPct > 0 && customer?.group) {
      setCartDiscountMode("percent");
      setCartDiscount(discPct);
      setCartDiscountInput(String(discPct));
      setShowCartDiscount(true);
      setGroupDiscountBanner({
        groupName: customer.group.name,
        percent: String(discPct),
      });
    } else if (groupDiscountBanner) {
      setCartDiscount(0);
      setCartDiscountInput("");
      setShowCartDiscount(false);
      setGroupDiscountBanner(null);
    }
  };

  const resetQuickCreateForm = () => {
    setQcName("");
    setQcPhone("");
    setQcEmail("");
    setQcGroupId("");
  };

  // Quick-create a customer mid-transaction, immediately select them in the
  // cart, and apply their group discount if present — mirrors handleCustomerChange
  // but sources the group from the quick-create form rather than the picker.
  const handleQuickCreateCustomer = async () => {
    if (!qcName.trim()) return;
    try {
      const newCustomer = await createCustomer({
        name: qcName.trim(),
        phone: qcPhone.trim() || null,
        email: qcEmail.trim() || null,
        groupId: qcGroupId || null,
      }).unwrap();

      showSuccess(`Customer "${newCustomer.name}" created`);
      dispatch(setCustomer(newCustomer.id));

      if (qcGroupId) {
        const selectedGroup = groups.find((g) => g.id === qcGroupId);
        if (selectedGroup) {
          const discPct = parseFloat(selectedGroup.discountPercent);
          if (discPct > 0) {
            setCartDiscountMode("percent");
            setCartDiscount(discPct);
            setCartDiscountInput(String(discPct));
            setShowCartDiscount(true);
            setGroupDiscountBanner({
              groupName: selectedGroup.name,
              percent: String(discPct),
            });
          }
        }
      }

      setQuickCreateOpen(false);
      resetQuickCreateForm();
    } catch (err) {
      showApiError(err);
    }
  };

  // Handles both USB HID scanner and phone/WebSocket scanner scans.
  // The lookup API resolves the barcode to a product+variant and returns stock
  // state, so we mirror the same guard logic used in handleAddStandardProduct.
  // Look up a resolved product/GTIN code and add it (stock-guarded). Optional
  // `unitPrice` override rings the line at a label-decoded price (GS1 embedded
  // price) instead of the catalog price. Throws on lookup failure — callers catch.
  const addProductByCode = useCallback(
    async (code: string, opts?: { unitPrice?: number }) => {
      const { product, matchedVariantId } = await lookupBarcode(code, false).unwrap();

      const variant = matchedVariantId
        ? product.variants?.find((v) => v.id === matchedVariantId)
        : null;

      // A parent-product barcode on a variable product is ambiguous — we can't
      // know which variant to add, so we reject it and ask for a variant scan.
      if (product.productType === ProductType.VARIABLE && !matchedVariantId) {
        showApiError({
          data: {
            error: {
              message: `"${product.name}" is a variable product — scan a variant barcode or choose a variant on screen.`,
            },
          },
        });
        return;
      }

      const state =
        variant && matchedVariantId
          ? getVariantStockState(variant, effectiveStoreId)
          : getProductLevelStockState(product, effectiveStoreId);

      const catalogUnit = variant?.sellPrice
        ? parseFloat(variant.sellPrice)
        : parseFloat(product.sellPrice);
      const unitPrice = opts?.unitPrice ?? catalogUnit;
      const costPrice = variant?.costPrice
        ? parseFloat(variant.costPrice)
        : parseFloat(product.costPrice);
      const displayName = variant ? `${product.name} — ${variant.name}` : product.name;

      const inCart = getInCartQty(product.id, matchedVariantId ?? null);
      if (state.kind === "untracked") {
        showApiError({
          data: { error: { message: `${displayName} has no stock at this store yet` } },
        });
        return;
      }
      if (state.kind === "tracked") {
        if (state.quantity <= 0) {
          showApiError({ data: { error: { message: `${displayName} is out of stock` } } });
          return;
        }
        if (inCart + 1 > state.quantity) {
          showApiError({
            data: {
              error: {
                message: `Only ${state.quantity} ${displayName} in stock — already ${inCart} in cart`,
              },
            },
          });
          return;
        }
      }

      // 999 = unlimited sentinel — CartRow uses this to suppress the stock badge
      const maxStock = state.kind === "tracked" ? state.quantity : 999;

      dispatch(
        addToCart({
          id: `${product.id}-${matchedVariantId || "none"}`,
          productId: product.id,
          productType: product.productType,
          variantId: matchedVariantId,
          name: displayName,
          sku: variant?.sku || product.sku,
          unitPrice,
          costPrice,
          quantity: 1,
          discount: 0,
          taxCategory: product.taxCategory,
          taxInclusive: product.taxInclusive,
          levies: getActiveLevies(product),
          maxStock,
          din: product.din ?? null,
        }),
      );
      showSuccess(`✓ ${displayName} added`);
    },
    [lookupBarcode, dispatch, getInCartQty, effectiveStoreId],
  );

  // Layer 2 (Phase 1.3c): decode the raw scan, then route by kind. Plain product
  // codes add instantly (unchanged from 1.3a); GS1 embedded-price and Rx-label
  // scans go through the confirm preview (§6.8 "never ring a wrong amount").
  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      // Scanner keystrokes also land in a focused search box — clear it.
      setSearch("");
      const result = decodeBarcode(barcode, { templates });

      switch (result.kind) {
        case "product":
          try {
            await addProductByCode(result.code);
          } catch (err) {
            showApiError(err);
          }
          return;
        case "gs1":
          if (result.price != null) {
            let title = "Scanned item";
            if (result.gtin) {
              try {
                const { product } = await lookupBarcode(result.gtin, false).unwrap();
                title = product.name;
              } catch {
                /* no catalog match — ring as a weighed misc line */
              }
            }
            setScanPreview({
              kind: "gs1",
              title,
              price: result.price,
              weightKg: result.weightKg,
              gtin: result.gtin,
            });
          } else if (result.gtin) {
            try {
              await addProductByCode(result.gtin);
            } catch (err) {
              showApiError(err);
            }
          } else {
            showApiError({
              data: { error: { message: "Couldn't identify the scanned item — use manual entry (F3)." } },
            });
          }
          return;
        case "rx":
          setScanPreview({
            kind: "rx",
            title: `Rx #${result.fields.rxNumber ?? "?"}`,
            rxNumber: result.fields.rxNumber,
            patient: result.fields.patient,
            price: result.fields.price ?? 0,
            taxCategory: result.taxCategory,
          });
          return;
        case "coupon":
          showSuccess("Coupon scanned — redemption arrives in a later update.");
          return;
        default:
          showApiError({
            data: { error: { message: "Couldn't read that barcode — use manual entry (F3)." } },
          });
      }
    },
    [templates, addProductByCode, lookupBarcode],
  );

  // Confirm a priced/Rx preview → ring the line. A GS1 scan that resolved to a
  // real product rings that product at the embedded price; an Rx label (or an
  // unresolved weighed item) rings a misc/open-price line at the decoded price.
  // The price is label-authorized (the preview is the safety gate), so no manager
  // grant is required — unlike a manual open-price entry.
  const handleScanPreviewConfirm = useCallback(async () => {
    const p = scanPreview;
    if (!p) return;
    setScanPreview(null);

    if (p.kind === "gs1" && p.gtin) {
      try {
        await addProductByCode(p.gtin, { unitPrice: p.price });
      } catch (err) {
        showApiError(err);
      }
      return;
    }

    if (!miscProduct?.id) {
      showApiError({
        data: { error: { message: "Miscellaneous product unavailable — cannot add this line." } },
      });
      return;
    }
    const name = p.kind === "rx" && p.patient ? `${p.title} — ${p.patient}` : p.title;
    dispatch(
      addMiscItem({
        id: `${p.kind}-${crypto.randomUUID()}`,
        productId: miscProduct.id,
        name,
        sku: p.kind === "rx" ? "__RX__" : "__WEIGHED__",
        unitPrice: p.price,
        costPrice: 0,
        quantity: 1,
        discount: 0,
        taxCategory: p.taxCategory ?? "STANDARD",
        taxInclusive: false,
        levies: [],
        maxStock: 999,
        isMisc: true,
      }),
    );
    showSuccess(`✓ ${name} added`);
  }, [scanPreview, addProductByCode, miscProduct?.id, dispatch]);

  const handleScanPreviewCancel = useCallback(() => setScanPreview(null), []);

  useBarcodeScanner({ onScan: handleBarcodeScan, enabled: scannerEnabled });

  const { connected: socketConnected, scanners: connectedScanners } = useSocketScanner({
    onBarcode: handleBarcodeScan,
    storeId: effectiveStoreId,
    enabled: scannerEnabled,
  });

  // ── Cart totals (Decimal-safe) ────────────────────────────────────────────

  // computeCartTotals delegates to the shared priceCart engine (same rules as
  // the backend) so rounding errors don't accumulate across many line items.
  // Without a resolved province (store not yet selected / has no province set)
  // it fails soft with zeroed tax — the UI should surface that state to the
  // cashier rather than show a wrong number.
  const totals = useMemo(
    () => computeCartTotals(cart.items, cartDiscount, cartDiscountMode, cart.storeProvince),
    [cart.items, cartDiscount, cartDiscountMode, cart.storeProvince],
  );

  const cartDiscountNum = totals.cartDiscount.toNumber();
  const totalDiscountNum = totals.totalDiscount.toNumber();
  const grandTotalNum = totals.grandTotal.toNumber();
  const { totalQty } = totals;

  const paymentMath = useMemo(
    () => computeChange(payments, totals.grandTotal),
    [payments, totals.grandTotal],
  );
  const totalPaidNum = paymentMath.totalPaid.toNumber();
  const changeAmountNum = paymentMath.changeAmount.toNumber();
  const dueAmountNum = paymentMath.dueAmount.toNumber();

  // Reconcile a stale discount-override grant (Phase 1.3a, Task 16 fix).
  // `cart.discountOverride` is only valid for the EXACT (mode, value) it was
  // granted for — the same pair `handleCheckout` rebuilds
  // `discountOverCapCtx` from below. Any path that changes the committed
  // cart discount without going through a fresh grant (the "Clear" link,
  // dismissing the group-discount banner, switching customers, toggling the
  // mode, etc.) would otherwise leave a grant whose context no longer
  // matches what checkout rebuilds, and the backend's consumeOverride hash
  // check fails closed — rejecting the ENTIRE sale. Centralizing the check
  // here (rather than patching every handler that can change the discount)
  // guarantees the grant is dropped the instant it diverges, from any path,
  // present or future.
  useEffect(() => {
    const override = cart.discountOverride;
    if (override && (override.mode !== cartDiscountMode || override.value !== cartDiscount)) {
      dispatch(setDiscountOverride(null));
    }
  }, [cart.discountOverride, cartDiscountMode, cartDiscount, dispatch]);

  // Guard: verify real-time stock before dispatching. The product tile already
  // shows a visual badge, but this is the hard gate for "not stocked" and
  // "out of stock" states, plus the ceiling check (already-in-cart + 1 > stock).
  const handleAddStandardProduct = (product: (typeof products)[0]) => {
    const state = getProductLevelStockState(product, effectiveStoreId);
    const inCart = getInCartQty(product.id, null);

    if (state.kind === "untracked") {
      showApiError({
        data: {
          error: {
            message: `${product.name} has no stock at this store yet`,
          },
        },
      });
      return;
    }
    if (state.kind === "tracked") {
      if (state.quantity <= 0) {
        showApiError({
          data: { error: { message: `${product.name} is out of stock` } },
        });
        return;
      }
      if (inCart + 1 > state.quantity) {
        showApiError({
          data: {
            error: {
              message: `Only ${state.quantity} ${product.name} in stock — already ${inCart} in cart`,
            },
          },
        });
        return;
      }
    }

    const maxStock = state.kind === "tracked" ? state.quantity : 999;

    dispatch(
      addToCart({
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
        din: product.din ?? null,
      }),
    );
  };

  // Variable products can't be added directly — the cashier must pick a variant
  // first. We still run an aggregate stock guard here so an "all-out" variable
  // product is blocked before the picker even opens.
  const handleProductTileClick = (product: (typeof products)[0]) => {
    if (product.productType === ProductType.VARIABLE) {
      const agg = getVariableProductAggregateStockState(product, effectiveStoreId);
      if (agg.kind === "untracked") {
        showApiError({
          data: {
            error: {
              message: `${product.name} has no variant stock at this store yet`,
            },
          },
        });
        return;
      }
      if (agg.kind === "tracked" && agg.quantity <= 0) {
        showApiError({
          data: {
            error: {
              message: `${product.name} is out of stock (all variants)`,
            },
          },
        });
        return;
      }
      setVariantPickerProduct(product);
      return;
    }
    handleAddStandardProduct(product);
  };

  const handleAddVariantToCart = (product: Product, variant: ProductVariant) => {
    if (!effectiveStoreId) return;

    const state = getVariantStockState(variant, effectiveStoreId);
    const displayName = `${product.name} — ${variant.name}`;
    const inCart = getInCartQty(product.id, variant.id);

    if (!variant.isActive) {
      showApiError({
        data: {
          error: {
            message: `${displayName} is inactive and cannot be sold`,
          },
        },
      });
      return;
    }

    if (state.kind === "untracked") {
      showApiError({
        data: {
          error: {
            message: `${displayName} has no stock at this store yet`,
          },
        },
      });
      return;
    }
    if (state.kind === "tracked") {
      if (state.quantity <= 0) {
        showApiError({
          data: { error: { message: `${displayName} is out of stock` } },
        });
        return;
      }
      if (inCart + 1 > state.quantity) {
        showApiError({
          data: {
            error: {
              message: `Only ${state.quantity} ${displayName} in stock — already ${inCart} in cart`,
            },
          },
        });
        return;
      }
    }

    const maxStock = state.kind === "tracked" ? state.quantity : 999;
    const unitPrice = variant.sellPrice
      ? parseFloat(variant.sellPrice)
      : parseFloat(product.sellPrice);
    const costPrice = variant.costPrice
      ? parseFloat(variant.costPrice)
      : parseFloat(product.costPrice);

    dispatch(
      addToCart({
        id: `${product.id}-${variant.id}`,
        productId: product.id,
        productType: ProductType.VARIABLE,
        variantId: variant.id,
        name: displayName,
        sku: variant.sku,
        unitPrice,
        costPrice,
        quantity: 1,
        discount: 0,
        taxCategory: product.taxCategory,
        taxInclusive: product.taxInclusive,
        levies: getActiveLevies(product),
        maxStock,
        din: product.din ?? null,
      }),
    );
    showSuccess(`✓ ${displayName} added`);
    setVariantPickerProduct(null);
  };

  // Gated cart-level discount apply (Phase 1.3a, Task 16). The raw typed
  // text/mode always update immediately (live display), but the COMMITTED
  // `cartDiscount` — the value that actually feeds computeCartTotals and
  // rides to checkout — only updates immediately when the discount is
  // within the acting user's role cap. An over-cap discount instead opens
  // `pendingGate`; it does NOT take effect until a manager grant is
  // recorded via `setDiscountOverride` (see handleGateGranted below).
  const applyCartDiscount = (val: string, mode: "flat" | "percent") => {
    setCartDiscountInput(val);
    setCartDiscountMode(mode);
    const num = parseFloat(val) || 0;

    if (num <= 0) {
      setCartDiscount(0);
      if (cart.discountOverride) dispatch(setDiscountOverride(null));
      return;
    }

    if (
      exceedsCap({
        role: actingRole,
        mode,
        value: num,
        lineOrCartBase: totals.subtotal.toNumber(),
        caps: discountCaps,
      })
    ) {
      const ctx = discountOverCapCtx(mode, num);
      setPendingGate({
        ctx,
        title: "Discount requires manager approval",
        description:
          "This discount exceeds your role's limit — a manager must authorize it before it's applied.",
        onGranted: (grant, authorizerUserId) => {
          dispatch(setDiscountOverride({ grant, authorizerUserId, mode, value: num }));
          setCartDiscount(num);
        },
      });
      return;
    }

    setCartDiscount(num);
    // Clear any stale grant from a PRIOR over-cap discount — otherwise a
    // later within-cap edit would leave `cart.discountOverride` set for a
    // context that no longer matches the current discount, and checkout's
    // context rebuild (handleCheckout below) would fail the backend's
    // hash check closed.
    if (cart.discountOverride) dispatch(setDiscountOverride(null));
  };

  // Clears the cart-level discount input (the "Clear" link under the discount
  // input) and, if it was driven by an auto-applied group discount, clears
  // that banner too so it doesn't silently reapply.
  const handleClearCartDiscountInput = () => {
    setCartDiscountInput("");
    setCartDiscount(0);
    if (groupDiscountBanner) setGroupDiscountBanner(null);
  };

  // Dismisses the auto-applied group-discount banner (its "X" button) and
  // reverts the cart-level discount it had set.
  const handleClearGroupDiscount = () => {
    setCartDiscount(0);
    setCartDiscountInput("");
    setShowCartDiscount(false);
    setGroupDiscountBanner(null);
  };

  // Pre-fills the payment with the exact grand total so the cashier can
  // confirm a card/exact-cash payment in one tap, then opens the modal.
  const handleOpenPaymentModal = () => {
    if (!effectiveStoreId) return;
    // Open-till gate (Phase 1.4) — no sale without an open cashier shift.
    if (!tillSession.isOpen) {
      showApiError({
        data: { error: { message: "Open the till (enter a starting float) before taking payment." } },
      });
      return;
    }
    // Pharmacy schedule gate (Phase 2.2) — link an Rx / get consult first.
    if (pharmacyBlockers.length > 0) {
      showApiError({
        data: {
          error: {
            message: `Prescription or pharmacist consult required for: ${pharmacyBlockers.map((b) => b.name).join(", ")}.`,
          },
        },
      });
      return;
    }
    // Same re-auth gate as handleCheckout (Phase 1.3b) — don't even open payment
    // on a resumed sale that still has authorizations awaiting re-approval.
    if (cart.items.some((i) => i.reauth) || cart.discountReauth) {
      showApiError({
        data: {
          error: {
            message: "This resumed sale needs manager re-authorization. Resolve the flagged items first.",
          },
        },
      });
      return;
    }
    setPayments([
      {
        method: PaymentMethod.CASH,
        amount: Math.ceil(grandTotalNum * 100) / 100,
      },
    ]);
    setPaymentModal(true);
  };

  // Stock-guard-checked quantity change for a cart line (CartRow's stepper /
  // direct-entry input) — clamps to maxStock and surfaces the same "only N in
  // stock" message used elsewhere rather than silently clamping.
  const handleQuantityChange = (item: CartItem, qty: number) => {
    if (item.maxStock < 999 && qty > item.maxStock) {
      showApiError({
        data: {
          error: {
            message: `Only ${item.maxStock} ${item.name} in stock`,
          },
        },
      });
      dispatch(updateQuantity({ id: item.id, quantity: item.maxStock }));
      return;
    }
    dispatch(updateQuantity({ id: item.id, quantity: qty }));
  };

  // Gated line-level discount apply (Phase 1.3a, Task 16). `discount` here
  // is always an absolute dollar amount (CartRow converts a typed percent to
  // a flat amount before calling this) — `exceedsCap` is called with
  // mode:"flat", which derives the same effective-percent check regardless
  // of how the cashier entered it. Unlike the cart-level discount, a
  // granted line-discount override is NOT recorded anywhere (no per-line
  // grant slot exists in cart state, and this discount is never re-audited
  // at checkout) — the manager's PIN-verified grant response from the 1.1
  // override endpoint (itself audited at request time) is treated as
  // sufficient one-time authorization to apply it immediately.
  const handleDiscountChange = (id: string, discount: number) => {
    const item = cart.items.find((i) => i.id === id);
    if (!item) return;

    if (discount <= 0) {
      dispatch(updateDiscount({ id, discount: 0 }));
      return;
    }

    const lineBase = item.unitPrice * item.quantity;
    if (
      exceedsCap({
        role: actingRole,
        mode: "flat",
        value: discount,
        lineOrCartBase: lineBase,
        caps: discountCaps,
      })
    ) {
      setPendingGate({
        ctx: discountOverCapCtx("flat", discount),
        title: "Line discount requires manager approval",
        description: `This discount on "${item.name}" exceeds your role's limit — a manager must authorize it before it's applied.`,
        onGranted: () => {
          dispatch(updateDiscount({ id, discount }));
        },
      });
      return;
    }

    dispatch(updateDiscount({ id, discount }));
  };

  // Gated line void (Phase 1.3a, Task 16) — ANY line removal requires a
  // manager override (D4 of the design spec: "voids need manager
  // override"), consumed + audited at action time via `consumeOverride`
  // (this never reaches a persisted sale, so it can't ride on checkout's
  // own audit trail). The line is only removed AFTER the consume call
  // resolves successfully — a tampered/expired/mismatched grant rejects
  // with a 400, `.unwrap()` throws, and the line stays in the cart.
  const handleRemoveItem = (item: CartItem) => {
    const ctx = voidLineCtx(item.productId);
    setPendingGate({
      ctx,
      title: "Void line requires manager approval",
      description: `Voiding "${item.name}" requires a manager override.`,
      onGranted: async (grant) => {
        try {
          await consumeOverride({ action: ctx.action, context: ctx.context, grant }).unwrap();
          dispatch(voidLine(item.id));
        } catch (err) {
          showApiError(err);
        }
      },
    });
  };

  // Opens PriceOverrideModal for a given line (per-line control or the
  // `priceOverride` hotkey, which targets the currently expanded/selected
  // line — see page.tsx).
  const handleOpenPriceOverride = (item: CartItem) => {
    setPriceOverrideItem(item);
  };

  const handleClosePriceOverride = () => {
    setPriceOverrideItem(null);
  };

  const handleCheckout = async () => {
    const storeId = effectiveStoreId;
    if (!storeId) {
      showApiError({
        data: { error: { message: "Please select a store to continue" } },
      });
      return;
    }

    // Resumed/recovered sales keep their overridden prices but had their grants
    // stripped at park time (Phase 1.3b, B3) — block checkout until a manager
    // re-authorizes each, so the sale can never be charged at an overridden
    // price without a fresh, audited authorization.
    if (cart.items.some((i) => i.reauth) || cart.discountReauth) {
      showApiError({
        data: {
          error: {
            message: "This resumed sale needs manager re-authorization. Resolve the flagged items first.",
          },
        },
      });
      return;
    }

    if (dueAmountNum > 0) {
      showApiError({
        data: { error: { message: "Insufficient payment amount" } },
      });
      return;
    }

    // Open-till gate (Phase 1.4) — every sale attaches to an open cashier shift.
    if (!tillSession.isOpen) {
      showApiError({
        data: { error: { message: "Open the till (enter a starting float) before charging." } },
      });
      return;
    }
    // Pharmacy schedule gate (Phase 2.2) — backend enforces; this is the early hint.
    if (pharmacyBlockers.length > 0) {
      showApiError({
        data: {
          error: {
            message: `Prescription or pharmacist consult required for: ${pharmacyBlockers.map((b) => b.name).join(", ")}.`,
          },
        },
      });
      return;
    }

    const missingVariant = cart.items.find(
      (i) => i.productType === ProductType.VARIABLE && !i.variantId,
    );
    if (missingVariant) {
      showApiError({
        data: {
          error: {
            message: `Checkout requires a variant for variable products. Fix line: "${missingVariant.name}".`,
          },
        },
      });
      return;
    }

    try {
      // Collect manager-override grants riding along with this checkout
      // (Phase 1.3a, Task 14/9/15). Each context string is REBUILT here with
      // the SAME builder + inputs used when the grant was originally
      // requested — the backend's consumeOverride hashes `context` and
      // fails closed on any mismatch, so this must byte-for-byte match:
      //  - PriceOverrideModal requests priceOverrideCtx(productId,
      //    line.unitPrice /* pre-override */, newPrice).
      //  - overrideLinePrice (cart.slice) snapshots that same pre-override
      //    unitPrice as priceOverride.originalPrice BEFORE overwriting
      //    item.unitPrice with newPrice — so rebuilding from
      //    (originalPrice, the line's current unitPrice) below reproduces
      //    the exact same (oldPrice, newPrice) pair.
      //  - ManualItemModal (Task 15) requests openPriceItemCtx(price,
      //    description) for misc lines — buildMiscCartLine sets the
      //    resulting line's unitPrice/name to that SAME price/description,
      //    so rebuilding openPriceItemCtx(item.unitPrice, item.name) below
      //    reproduces the exact same (price, description) pair. Misc lines
      //    also carry a `priceOverride` (for the grant/authorizer), but must
      //    be routed to OPEN_PRICE_ITEM rather than PRICE_OVERRIDE.
      const overrides: { action: string; context: string; grant: string }[] = [];
      for (const item of cart.items) {
        if (item.priceOverride && item.isMisc) {
          const ctx = openPriceItemCtx(item.unitPrice, item.name);
          overrides.push({
            action: ctx.action,
            context: ctx.context,
            grant: item.priceOverride.grant,
          });
        } else if (item.priceOverride) {
          const ctx = priceOverrideCtx(
            item.productId,
            item.priceOverride.originalPrice,
            item.unitPrice,
          );
          overrides.push({
            action: ctx.action,
            context: ctx.context,
            grant: item.priceOverride.grant,
          });
        }
      }
      // Discount-override request (Task 16) isn't wired yet — collect the
      // grant if present so checkout doesn't drop it once it is, else skip.
      // Rebuilt from the SAME raw cartDiscount/cartDiscountMode sent below
      // (the discount value the manager actually authorized).
      if (cart.discountOverride) {
        const ctx = discountOverCapCtx(cartDiscountMode, cartDiscount);
        overrides.push({
          action: ctx.action,
          context: ctx.context,
          grant: cart.discountOverride.grant,
        });
      }

      // Phase 2.2 — pharmacist consult grants (behind-counter) ride to checkout
      // for audit; the backend derives consultAck per product from them.
      for (const item of cart.items) {
        if (item.consultGrant) {
          overrides.push({
            action: "RX_CONSULT",
            context: item.consultGrant.context,
            grant: item.consultGrant.grant,
          });
        }
      }

      // Cart-level discount is sent to the backend as a single top-level value
      // (same raw input + mode that drives the on-screen computeCartTotals),
      // which re-derives it via the SAME priceCart engine. No client-side
      // proportional distribution across lines — that would risk drifting
      // from what the cashier saw on screen.
      const data = await checkout({
        storeId,
        shiftId: tillSession.shiftId ?? undefined,
        customerId: cart.customerId || undefined,
        items: cart.items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId || undefined,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount,
          // Phase 2.2 — PII-free Rx link (backend enforces schedule compliance).
          ...(i.rx ? { rx: i.rx } : {}),
        })),
        cartDiscount,
        cartDiscountMode,
        ...(couponCode ? { couponCode } : {}),
        ...(redeemPoints > 0 ? { redeemPoints } : {}),
        payments,
        notes: cart.notes || undefined,
        ...(overrides.length > 0 ? { overrides } : {}),
      }).unwrap();
      showSuccess("Sale completed!");

      setReceiptSaleId(data.id);
      setReceiptInvoiceNo(data.invoiceNo);
      setShowReceipt(true);

      // Auto-print the receipt to the store's network printer (Phase 2.11).
      // Non-blocking: a missing printer is silent; an unreachable one just warns.
      // The sale is already saved regardless.
      printSaleReceipt({ saleId: data.id })
        .unwrap()
        .then((r) => {
          if (r?.ok) showSuccess("Receipt sent to printer");
        })
        .catch(() => showApiError(new Error("Sale saved, but the receipt printer is unreachable.")));

      dispatch(clearCart());
      // Completed sale — drop the crash-recovery mirror (Phase 1.3b).
      parkedStore.clearActive().catch(() => {});
      setPaymentModal(false);
      setPayments([{ method: PaymentMethod.CASH, amount: 0 }]);
      setCartDiscount(0);
      setCartDiscountInput("");
      setShowCartDiscount(false);
      setGroupDiscountBanner(null);
    } catch (err) {
      showApiError(err);
    }
  };

  // Performs the actual clear (Redux + local UI state reset) — split out so
  // the gated `handleClearCart` below can invoke it either immediately (an
  // already-empty cart, nothing to gate) or after a manager grant is
  // consumed.
  const performClearCart = () => {
    dispatch(clearCart());
    setCartDiscount(0);
    setCartDiscountInput("");
    setShowCartDiscount(false);
    setExpandedItemId(null);
    setGroupDiscountBanner(null);
    setPriceOverrideItem(null);
  };

  // Gated clear-transaction (Phase 1.3a, Task 16) — clearing a NON-EMPTY
  // cart requires a manager override, consumed + audited at action time via
  // `consumeOverride` (mirrors handleRemoveItem's void-line gate; CartPanel
  // only renders the "Clear All" control once the cart has items, but this
  // guard also covers any other future caller).
  const handleClearCart = () => {
    if (cart.items.length === 0) {
      performClearCart();
      return;
    }

    const ctx = voidTransactionCtx(cart.items.length);
    setPendingGate({
      ctx,
      title: "Clear transaction requires manager approval",
      description: `Clearing this transaction (${cart.items.length} item${
        cart.items.length === 1 ? "" : "s"
      }) requires a manager override.`,
      onGranted: async (grant) => {
        try {
          await consumeOverride({ action: ctx.action, context: ctx.context, grant }).unwrap();
          performClearCart();
        } catch (err) {
          showApiError(err);
        }
      },
    });
  };

  // Resolves `pendingGate` once `OverrideGateModal` reports a granted PIN —
  // invokes the action-specific continuation captured when the gate was
  // opened, then closes the gate regardless of outcome (a rejected
  // consume/checkout inside `onGranted` shows its own error via
  // showApiError; the gate itself doesn't need to stay open for a retry —
  // the cashier re-triggers the action to request a fresh grant).
  const handleGateGranted = async (grant: string, authorizerUserId: string) => {
    const gate = pendingGate;
    setPendingGate(null);
    if (gate) await gate.onGranted(grant, authorizerUserId);
  };

  const handleGateClose = () => setPendingGate(null);

  // ─── Suspend / Resume (Phase 1.3b) ─────────────────────────────────────────

  const parkedByName =
    `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || null;

  // Resumed/recovered lines keep their price but their grant was stripped (B3);
  // these markers gate checkout until re-authorized.
  const pendingReauthCount =
    cart.items.filter((i) => i.reauth).length + (cart.discountReauth ? 1 : 0);
  const needsReauth = pendingReauthCount > 0;

  // Park the current cart: write a grant-free snapshot to IndexedDB (instant,
  // offline-safe), clear the recovery mirror, mirror to the backend best-effort,
  // then clear the cart.
  const doPark = useCallback(
    async (label: string | null) => {
      if (cart.items.length === 0 || !effectiveStoreId) return;
      const id = crypto.randomUUID();
      const snapshot = serializeSnapshot(cart, cartDiscount, cartDiscountMode);
      const record: ParkedSaleRecord = {
        id,
        storeId: effectiveStoreId,
        customerId: cart.customerId,
        label: label || null,
        parkedByUserId: user?.id ?? null,
        parkedByName,
        parkedAt: new Date().toISOString(),
        itemCount: totalQty,
        total: grandTotalNum,
        snapshot,
        origin: "local",
      };
      try {
        await parkedStore.put(record);
        await parkedStore.clearActive();
      } catch {
        showApiError({ data: { error: { message: "Could not park the sale on this device." } } });
        return;
      }
      // Best-effort mirror; on failure (offline) the write is enqueued and
      // flushed on reconnect (1.3b follow-up). The hold stays local-only until
      // then and still recalls on this device (recall merges local ∪ remote).
      const mirrorBody: MirrorParkedSaleRequest = {
        id,
        storeId: effectiveStoreId,
        customerId: cart.customerId,
        label: label || null,
        parkedByName,
        snapshot,
        itemCount: totalQty,
        total: grandTotalNum,
      };
      mirrorParkedSale(mirrorBody)
        .unwrap()
        .catch(() => {
          dispatch(
            enqueueOfflineAction({
              id,
              payload: { kind: "parkedSaleMirror", body: mirrorBody },
              createdAt: new Date().toISOString(),
            }),
          );
        });
      performClearCart();
      setParkModalOpen(false);
      showSuccess("Sale parked");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, cartDiscount, cartDiscountMode, effectiveStoreId, user?.id, parkedByName, totalQty, grandTotalNum, parkedStore, mirrorParkedSale],
  );

  const handleOpenPark = useCallback(() => {
    if (cart.items.length === 0) {
      showApiError({ data: { error: { message: "Nothing to park — the cart is empty." } } });
      return;
    }
    setParkModalOpen(true);
  }, [cart.items.length]);

  // Recall list = this store's local holds ∪ the backend's store list, deduped.
  const refreshRecallList = useCallback(async () => {
    const store = effectiveStoreId;
    let local: ParkedSaleRecord[] = [];
    try {
      local = (await parkedStore.list()).filter((r) => !store || r.storeId === store);
    } catch {
      local = [];
    }
    let remote: ParkedSaleRecord[] = [];
    if (store) {
      try {
        remote = await triggerListRemote({ storeId: store }).unwrap();
      } catch {
        remote = [];
      }
    }
    // 24h retention sweep (1.3b follow-up): discard holds older than a day so
    // stale parks don't accumulate. Prune locally + mark the mirror DISCARDED.
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const merged = mergeRecallList(local, remote);
    const stale = merged.filter((r) => new Date(r.parkedAt).getTime() < cutoff);
    for (const r of stale) {
      parkedStore.remove(r.id).catch(() => {});
      if (r.origin === "remote") discardParkedSale({ id: r.id }).unwrap().catch(() => {});
    }
    setRecallRecords(merged.filter((r) => new Date(r.parkedAt).getTime() >= cutoff));
  }, [effectiveStoreId, parkedStore, triggerListRemote, discardParkedSale]);

  const handleOpenRecall = useCallback(async () => {
    setRecallOpen(true);
    setRecallLoading(true);
    await refreshRecallList();
    setRecallLoading(false);
  }, [refreshRecallList]);

  // Restore a parked hold into the live cart. A non-empty cart is parked first
  // (the recall UI tells the cashier — B8, never discard silently). Remote-backed
  // holds are claimed atomically; a 409 means another till got there first.
  const doResume = useCallback(
    async (record: ParkedSaleRecord) => {
      if (cart.items.length > 0) {
        await doPark(null);
      }
      let snapshot = record.snapshot;
      if (record.origin === "remote") {
        try {
          const res = await claimParkedSale({ id: record.id }).unwrap();
          snapshot = res.snapshot;
        } catch {
          showApiError({
            data: { error: { message: "This sale was already resumed at another till." } },
          });
          await refreshRecallList();
          return;
        }
      }
      const restored = deserializeSnapshot(snapshot);
      dispatch(replaceCart(restored.cartState));
      setCartDiscount(restored.cartDiscount);
      setCartDiscountMode(restored.cartDiscountMode);
      setCartDiscountInput(restored.cartDiscount > 0 ? String(restored.cartDiscount) : "");
      setShowCartDiscount(restored.cartDiscount > 0);

      // Resume-time stock re-validation (1.3b follow-up): stock may have moved
      // while parked. Best-effort against the loaded product list — clamp any
      // line now over available and warn (the backend checkout guard is the hard
      // gate for products not in the loaded page).
      const clamped: string[] = [];
      for (const line of restored.cartState.items) {
        const prod = products.find((p) => p.id === line.productId);
        if (!prod) continue;
        const variant = line.variantId
          ? prod.variants?.find((v) => v.id === line.variantId)
          : null;
        const st =
          variant && line.variantId
            ? getVariantStockState(variant, effectiveStoreId)
            : getProductLevelStockState(prod, effectiveStoreId);
        if (st.kind === "tracked" && st.quantity < line.quantity) {
          dispatch(updateQuantity({ id: line.id, quantity: Math.max(1, st.quantity) }));
          clamped.push(line.name);
        }
      }
      if (clamped.length > 0) {
        showApiError({
          data: {
            error: {
              message: `Stock changed while parked — reduced quantity on: ${clamped.join(", ")}.`,
            },
          },
        });
      }

      // Consume the hold: remove locally (remote is already CLAIMED server-side).
      parkedStore.remove(record.id).catch(() => {});
      setRecallOpen(false);
      showSuccess("Sale resumed");
      if (snapshotNeedsReauth(snapshot)) {
        showApiError({
          data: {
            error: { message: "Resumed sale needs manager re-authorization before checkout." },
          },
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart.items.length, doPark, claimParkedSale, dispatch, parkedStore, refreshRecallList, products, effectiveStoreId],
  );

  const handleDiscardParked = useCallback(
    async (record: ParkedSaleRecord) => {
      parkedStore.remove(record.id).catch(() => {});
      if (record.origin === "remote") discardParkedSale({ id: record.id }).unwrap().catch(() => {});
      await refreshRecallList();
    },
    [parkedStore, discardParkedSale, refreshRecallList],
  );

  // Re-authorize a resumed line's overridden/open price via the existing manager
  // gate; on grant, a fresh grant is re-attached and the marker cleared.
  const handleReauthLine = useCallback(
    (item: CartItem) => {
      if (!item.reauth) return;
      const ctx =
        item.reauth.kind === "openPriceItem"
          ? openPriceItemCtx(item.unitPrice, item.name)
          : priceOverrideCtx(item.productId, item.reauth.originalPrice, item.unitPrice);
      const originalPrice = item.reauth.kind === "priceOverride" ? item.reauth.originalPrice : 0;
      setPendingGate({
        ctx,
        title: "Re-authorize price",
        description:
          "This resumed line's manager-approved price must be re-authorized before checkout.",
        onGranted: (grant, authorizerUserId) => {
          dispatch(resolveLineReauth({ id: item.id, originalPrice, grant, authorizerUserId }));
        },
      });
    },
    [dispatch],
  );

  const handleReauthDiscount = useCallback(() => {
    if (!cart.discountReauth) return;
    const { mode, value } = cart.discountReauth;
    const ctx = discountOverCapCtx(mode, value);
    setPendingGate({
      ctx,
      title: "Re-authorize discount",
      description:
        "This resumed sale's over-cap discount must be re-authorized before checkout.",
      onGranted: (grant, authorizerUserId) => {
        // setDiscountOverride clears the discountReauth marker.
        dispatch(setDiscountOverride({ grant, authorizerUserId, mode, value }));
      },
    });
  }, [cart.discountReauth, dispatch]);

  // ── Offline-queue flush (1.3b follow-up) ──
  // Retry queued parked-sale mirror writes on mount and whenever the network
  // comes back. Failures stay queued (no dequeue → no re-run loop); successes
  // dequeue. Unknown payloads are dropped.
  useEffect(() => {
    const flush = () => {
      for (const item of offlineQueueItems) {
        const p = item.payload as { kind?: string; body?: MirrorParkedSaleRequest };
        if (p?.kind === "parkedSaleMirror" && p.body) {
          mirrorParkedSale(p.body)
            .unwrap()
            .then(() => dispatch(dequeueOfflineAction(item.id)))
            .catch(() => {});
        } else {
          dispatch(dequeueOfflineAction(item.id));
        }
      }
    };
    if (offlineQueueItems.length > 0) flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [offlineQueueItems, mirrorParkedSale, dispatch]);

  // ── Crash recovery (TranSaf, B4) ──
  // Boot: surface a recoverable in-progress sale, then arm the mirror.
  useEffect(() => {
    let cancelled = false;
    parkedStore
      .loadActive()
      .then((m) => {
        if (cancelled) return;
        if (m && m.snapshot.items.length > 0) setRecoverMirror(m);
        recoveryResolvedRef.current = true;
      })
      .catch(() => {
        recoveryResolvedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [parkedStore]);

  // Continuously mirror the live cart (debounced) so a crash/refresh can recover
  // it. Grants are stripped by serializeSnapshot — a recovered sale re-auths too.
  useEffect(() => {
    if (!recoveryResolvedRef.current) return;
    const t = setTimeout(() => {
      if (cart.items.length === 0) {
        parkedStore.clearActive().catch(() => {});
      } else {
        parkedStore
          .saveActive({
            snapshot: serializeSnapshot(cart, cartDiscount, cartDiscountMode),
            updatedAt: new Date().toISOString(),
          })
          .catch(() => {});
      }
    }, 400);
    return () => clearTimeout(t);
  }, [cart, cartDiscount, cartDiscountMode, parkedStore]);

  const handleRecoverActive = useCallback(() => {
    if (!recoverMirror) return;
    const restored = deserializeSnapshot(recoverMirror.snapshot);
    dispatch(replaceCart(restored.cartState));
    setCartDiscount(restored.cartDiscount);
    setCartDiscountMode(restored.cartDiscountMode);
    setCartDiscountInput(restored.cartDiscount > 0 ? String(restored.cartDiscount) : "");
    setShowCartDiscount(restored.cartDiscount > 0);
    setRecoverMirror(null);
    if (snapshotNeedsReauth(recoverMirror.snapshot)) {
      showApiError({
        data: {
          error: { message: "Recovered sale needs manager re-authorization before checkout." },
        },
      });
    }
  }, [recoverMirror, dispatch]);

  const handleDiscardRecover = useCallback(() => {
    parkedStore.clearActive().catch(() => {});
    setRecoverMirror(null);
  }, [parkedStore]);

  // ─── Pharmacy schedule enforcement + Rx-at-till (Phase 2.2) ─────────────────

  // Resolve each drug line's schedule from its DIN (drives badges + the gate).
  // The backend compliance hook is authoritative; this is a proactive hint.
  useEffect(() => {
    const unresolved = cart.items.filter((i) => i.din && i.scheduleCategory === undefined);
    if (unresolved.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const item of unresolved) {
        try {
          const drug = await triggerGetDrug({ din: item.din! }).unwrap();
          if (!cancelled)
            dispatch(setLineSchedule({ id: item.id, scheduleCategory: drug.scheduleCategory }));
        } catch {
          if (!cancelled) dispatch(setLineSchedule({ id: item.id, scheduleCategory: "OPEN" }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cart.items, triggerGetDrug, dispatch]);

  const handleOpenLinkRx = useCallback((item: CartItem) => setLinkRxItem(item), []);
  const handleCloseLinkRx = useCallback(() => setLinkRxItem(null), []);

  const handleRxLinked = useCallback(
    (rxNumber: string, copay?: number) => {
      if (linkRxItem) dispatch(linkRx({ id: linkRxItem.id, rxNumber, copay }));
      setLinkRxItem(null);
    },
    [linkRxItem, dispatch],
  );

  const handleUnlinkRx = useCallback((item: CartItem) => dispatch(unlinkRx(item.id)), [dispatch]);

  // Pharmacist consult (behind-counter) via the 1.3a override PIN gate; the grant
  // is stashed on the line and rides to checkout for audit.
  const handleConsult = useCallback(
    (item: CartItem) => {
      setPendingGate({
        ctx: { action: "RX_CONSULT", context: item.productId },
        title: "Pharmacist consult",
        description: "A pharmacist must authorize this behind-counter item.",
        onGranted: (grant, authorizerUserId) => {
          dispatch(setConsult({ id: item.id, grant, authorizerUserId, context: item.productId }));
        },
      });
    },
    [dispatch],
  );

  const hasMultipleStores =
    !user?.storeId && Array.isArray((user as any)?.storeIds) && (user as any).storeIds.length > 0;

  const storeIds: string[] = hasMultipleStores ? (user as any).storeIds : [];

  return {
    // Search & scanner
    search,
    setSearch,
    scannerEnabled,
    setScannerEnabled,
    scanLoading,
    socketConnected,
    connectedScanners,
    handleBarcodeScan,

    // Barcode Layer 2 scan preview (Phase 1.3c)
    scanPreview,
    handleScanPreviewConfirm,
    handleScanPreviewCancel,

    // Till session (Phase 1.4)
    tillSession,

    // Pharmacy schedule enforcement + Rx-at-till (Phase 2.2)
    linkRxItem,
    handleOpenLinkRx,
    handleCloseLinkRx,
    handleRxLinked,
    handleUnlinkRx,
    handleConsult,
    pharmacyBlockers,

    // Store selection
    selectedStoreId,
    setSelectedStoreId,
    effectiveStoreId,
    hasMultipleStores,
    storeIds,

    // Stock filter & product grid
    stockFilter,
    setStockFilter,
    isLoading,
    products,
    visibleProducts,
    stockCounts,
    getInCartQty,

    // Product tile / variant picker
    handleProductTileClick,
    variantPickerProduct,
    setVariantPickerProduct,
    handleAddVariantToCart,

    // Cart
    cart,
    totals,
    cartDiscountNum,
    totalDiscountNum,
    grandTotalNum,
    totalQty,
    expandedItemId,
    setExpandedItemId,
    handleQuantityChange,
    handleDiscountChange,
    handleRemoveItem,
    priceOverrideItem,
    handleOpenPriceOverride,
    handleClosePriceOverride,
    handleClearCart,

    // Discount-cap + void/clear gating (Task 16)
    pendingGate,
    handleGateGranted,
    handleGateClose,

    // Cart-level discount UI
    cartDiscountMode,
    cartDiscountInput,
    // 3H.4 coupon
    couponCode,
    setCouponCode,
    // 3H.5 loyalty redemption
    redeemPoints,
    setRedeemPoints,
    loyaltyProgram,
    customerLoyaltyPoints,
    showCartDiscount,
    setShowCartDiscount,
    applyCartDiscount,
    groupDiscountBanner,
    handleClearGroupDiscount,
    handleClearCartDiscountInput,

    // Customer
    customers,
    groups,
    handleCustomerChange,

    // Quick-create customer
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
    creatingCustomer,
    handleQuickCreateCustomer,
    resetQuickCreateForm,

    // Checkout / payment
    paymentModal,
    setPaymentModal,
    payments,
    setPayments,
    checkingOut,
    handleCheckout,
    handleOpenPaymentModal,
    totalPaidNum,
    changeAmountNum,
    dueAmountNum,

    // Receipt
    receiptSaleId,
    setReceiptSaleId,
    receiptInvoiceNo,
    setReceiptInvoiceNo,
    showReceipt,
    setShowReceipt,

    // Suspend / resume (Phase 1.3b)
    needsReauth,
    pendingReauthCount,
    parkModalOpen,
    setParkModalOpen,
    handleOpenPark,
    doPark,
    recallOpen,
    setRecallOpen,
    recallRecords,
    recallLoading,
    handleOpenRecall,
    doResume,
    handleDiscardParked,
    handleReauthLine,
    handleReauthDiscount,
    recoverMirror,
    handleRecoverActive,
    handleDiscardRecover,
  };
}

export type RingUp = ReturnType<typeof useRingUp>;
