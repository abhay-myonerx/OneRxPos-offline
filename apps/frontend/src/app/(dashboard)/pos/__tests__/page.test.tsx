import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CartItem, CartState } from "@/features/pos/types/cart.types";
import { PaymentMethod } from "@/types/enums/status.enums";
import PosPage from "../page";

// ── Harness ──────────────────────────────────────────────────────────────
// PosPage composes `useRingUp` (heavy: RTK Query + Redux) with several
// presentational children. To isolate the hotkey wiring under review here —
// Task 12's `pay` action, which must mirror the "Charge" button and open the
// payment modal rather than checking out directly — we mock `useRingUp` and
// stub out the child components, then dispatch real `keydown` events at
// `window` exactly like useRingUpHotkeys.test.ts does.

const item = (over: Partial<CartItem> = {}): CartItem => ({
  id: "line-1",
  productId: "p1",
  name: "Amoxicillin 500mg",
  sku: "AMX-500",
  unitPrice: 12.5,
  costPrice: 5,
  quantity: 2,
  discount: 0,
  taxCategory: "STANDARD",
  taxInclusive: false,
  levies: [],
  maxStock: 10,
  ...over,
});

const cartState = (over: Partial<CartState> = {}): CartState => ({
  items: [],
  customerId: null,
  storeId: null,
  shiftId: null,
  notes: "",
  storeProvince: null,
  discountOverride: null,
  ...over,
});

const handleCheckout = vi.fn();
const handleOpenPaymentModal = vi.fn();
const handleClearCart = vi.fn();

let mockRingUp: Record<string, unknown>;

function baseRingUp(over: Partial<Record<string, unknown>> = {}) {
  return {
    cart: cartState(),
    effectiveStoreId: null,
    grandTotalNum: 0,
    totalDiscountNum: 0,
    payments: [],
    setPayments: vi.fn(),
    paymentModal: false,
    setPaymentModal: vi.fn(),
    totalPaidNum: 0,
    changeAmountNum: 0,
    dueAmountNum: 0,
    checkingOut: false,
    handleCheckout,
    handleOpenPaymentModal,
    handleClearCart,
    quickCreateOpen: false,
    setQuickCreateOpen: vi.fn(),
    qcName: "",
    setQcName: vi.fn(),
    qcPhone: "",
    setQcPhone: vi.fn(),
    qcEmail: "",
    setQcEmail: vi.fn(),
    qcGroupId: "",
    setQcGroupId: vi.fn(),
    groups: [],
    creatingCustomer: false,
    handleQuickCreateCustomer: vi.fn(),
    resetQuickCreateForm: vi.fn(),
    variantPickerProduct: null,
    setVariantPickerProduct: vi.fn(),
    handleAddVariantToCart: vi.fn(),
    showReceipt: false,
    setShowReceipt: vi.fn(),
    receiptSaleId: null,
    setReceiptSaleId: vi.fn(),
    receiptInvoiceNo: "",
    setReceiptInvoiceNo: vi.fn(),
    ...over,
  };
}

vi.mock("@/features/pos/hooks/useRingUp", () => ({
  useRingUp: () => mockRingUp,
}));
vi.mock("@/features/pos/components/ProductSearchGrid", () => ({
  ProductSearchGrid: () => null,
}));
vi.mock("@/features/pos/components/CartPanel", () => ({
  CartPanel: () => null,
}));
vi.mock("@/features/pos/shift/components/TillStatusBar", () => ({
  TillStatusBar: () => null,
}));
vi.mock("@/features/pharmacy/components/LinkRxModal", () => ({
  LinkRxModal: () => null,
}));
vi.mock("@/features/pos/components/HotkeyHelpOverlay", () => ({
  HotkeyHelpOverlay: () => null,
}));
vi.mock("@/features/receipt/components/ReceiptPreviewModal", () => ({
  ReceiptPreviewModal: () => null,
}));

// Payment terminal (Phase 2.10) — the page calls terminalPurchase for CARD
// tenders. Mocked here so the page renders without a Redux store; overridable
// per-test via `terminalPurchaseUnwrap`.
let terminalPurchaseUnwrap: () => Promise<{ status: string; cardType: string | null }> = vi.fn(() =>
  Promise.resolve({ status: "APPROVED", cardType: "INTERAC_DEBIT" as string | null }),
);
const terminalPurchaseTrigger = vi.fn(() => ({ unwrap: terminalPurchaseUnwrap }));
vi.mock("@/features/pos/payment-terminal.api", () => ({
  useTerminalPurchaseMutation: () => [terminalPurchaseTrigger, { isLoading: false }],
}));
vi.mock("@/lib/api/error-handler", () => ({
  showApiError: vi.fn(),
  showSuccess: vi.fn(),
}));

function dispatchKey(key: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("PosPage — F12 (pay) hotkey wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the payment modal (not checkout) when the cart has items and a store is selected", () => {
    mockRingUp = baseRingUp({
      cart: cartState({ items: [item()] }),
      effectiveStoreId: "store-1",
    });
    render(<PosPage />);

    dispatchKey("F12");

    expect(handleOpenPaymentModal).toHaveBeenCalledTimes(1);
    expect(handleCheckout).not.toHaveBeenCalled();
  });

  it("is a no-op when the cart is empty", () => {
    mockRingUp = baseRingUp({
      cart: cartState({ items: [] }),
      effectiveStoreId: "store-1",
    });
    render(<PosPage />);

    dispatchKey("F12");

    expect(handleOpenPaymentModal).not.toHaveBeenCalled();
    expect(handleCheckout).not.toHaveBeenCalled();
  });

  it("is a no-op when no store is selected", () => {
    mockRingUp = baseRingUp({
      cart: cartState({ items: [item()] }),
      effectiveStoreId: null,
    });
    render(<PosPage />);

    dispatchKey("F12");

    expect(handleOpenPaymentModal).not.toHaveBeenCalled();
    expect(handleCheckout).not.toHaveBeenCalled();
  });
});

describe("PosPage — Complete Sale card capture (Phase 2.10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    terminalPurchaseUnwrap = vi.fn(() =>
      Promise.resolve({ status: "APPROVED", cardType: "INTERAC_DEBIT" }),
    );
  });

  function openModalWith(over: Partial<Record<string, unknown>>) {
    mockRingUp = baseRingUp({
      cart: cartState({ items: [item()] }),
      effectiveStoreId: "store-1",
      paymentModal: true,
      dueAmountNum: 0,
      ...over,
    });
    render(<PosPage />);
    // Modal is aria-hidden-until-visible in jsdom → query hidden.
    return screen.getByRole("button", { name: /Complete Sale/i, hidden: true });
  }

  it("charges the card on the terminal then checks out when APPROVED", async () => {
    const btn = openModalWith({ payments: [{ method: PaymentMethod.CARD, amount: 10 }] });
    fireEvent.click(btn);

    await waitFor(() =>
      expect(terminalPurchaseTrigger).toHaveBeenCalledWith({ amountCents: 1000 }),
    );
    await waitFor(() => expect(handleCheckout).toHaveBeenCalled());
  });

  it("aborts checkout when the card is DECLINED", async () => {
    terminalPurchaseUnwrap = vi.fn(() => Promise.resolve({ status: "DECLINED", cardType: null }));
    const btn = openModalWith({ payments: [{ method: PaymentMethod.CARD, amount: 10 }] });
    fireEvent.click(btn);

    await waitFor(() => expect(terminalPurchaseTrigger).toHaveBeenCalled());
    expect(handleCheckout).not.toHaveBeenCalled();
  });

  it("skips the terminal for a cash-only tender", async () => {
    const btn = openModalWith({ payments: [{ method: PaymentMethod.CASH, amount: 25 }] });
    fireEvent.click(btn);

    await waitFor(() => expect(handleCheckout).toHaveBeenCalled());
    expect(terminalPurchaseTrigger).not.toHaveBeenCalled();
  });
});
