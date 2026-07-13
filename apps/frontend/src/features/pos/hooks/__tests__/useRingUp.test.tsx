import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import cartReducer, { addToCart, overrideLinePrice, setStoreProvince } from "../../state/cart.slice";
import authReducer, { setCredentials } from "@/store/auth.slice";
import { Role } from "@/types/enums/role.enums";
import { ProductType, PaymentMethod } from "@/types/enums/status.enums";
import type { Product } from "@/features/products/types/product.types";
import { useRingUp } from "../useRingUp";

// ── Mocks ────────────────────────────────────────────────────────────────
// useRingUp pulls in a lot of RTK Query endpoints + the two scanner hooks.
// Mock them all so this is a pure unit test of the hook's own orchestration
// logic (mirrors the vi.mock pattern used by OverrideModal.test.tsx / etc.).

const mockLookupUnwrap = vi.fn();
const mockLookupTrigger = vi.fn(() => ({ unwrap: mockLookupUnwrap }));

vi.mock("@/features/products/api/products.api", () => ({
  useListProductsQuery: () => ({ data: { data: [], pagination: {} }, isLoading: false }),
  useLazyLookupByBarcodeQuery: () => [mockLookupTrigger, { isFetching: false }],
}));

vi.mock("@/features/customers/api/customers.api", () => ({
  useListCustomersQuery: () => ({ data: { data: [] } }),
  useCreateCustomerMutation: () => [vi.fn(), { isLoading: false }],
  useListGroupsQuery: () => ({ data: [] }),
  useGetLoyaltyProgramQuery: () => ({ data: undefined }),
}));

const mockCheckoutUnwrap = vi.fn();
const mockCheckoutTrigger = vi.fn((_body: unknown) => ({ unwrap: mockCheckoutUnwrap }));

vi.mock("@/features/sales/api/sales.api", () => ({
  useCheckoutMutation: () => [mockCheckoutTrigger, { isLoading: false }],
}));

vi.mock("@/features/stores/api/stores.api", () => ({
  useGetStoreQuery: () => ({ data: undefined }),
}));

// discountCaps source for the gating added in Task 16 — no override
// configured, so useRingUp falls back to DEFAULT_ROLE_CAPS.
vi.mock("@/features/auth/api/auth.api", () => ({
  useGetMeQuery: () => ({ data: undefined }),
}));

vi.mock("@/features/pos/api/pos.api", () => ({
  useConsumeOverrideMutation: () => [vi.fn(() => ({ unwrap: vi.fn() })), { isLoading: false }],
  // Suspend/resume endpoints (Phase 1.3b) — stubbed; this suite drives cart/checkout logic.
  useMirrorParkedSaleMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({ id: "p1" }) })), { isLoading: false }],
  useLazyListRemoteParkedSalesQuery: () => [vi.fn(() => ({ unwrap: () => Promise.resolve([]) })), { isLoading: false }],
  useClaimParkedSaleMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({ snapshot: {} }) })), { isLoading: false }],
  useDiscardParkedSaleMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve() })), { isLoading: false }],
  useGetMiscProductQuery: () => ({ data: { id: "misc-1" }, isLoading: false, isError: false }),
}));

// Barcode Layer 2 (Phase 1.3c): templates feed the pure decode pipeline.
vi.mock("@/features/pos/barcode/barcode.api", () => ({
  useListBarcodeTemplatesQuery: () => ({ data: [] }),
}));

// Till session (Phase 1.4): open shift so the checkout gate passes.
vi.mock("@/features/pos/shift/useTillSession", () => ({
  useTillSession: () => ({
    shift: null, shiftId: "shift-1", isOpen: true, isLoading: false, opening: false, closing: false,
    open: vi.fn(), close: vi.fn(), paidInOut: vi.fn(), fetchSummary: vi.fn(),
  }),
}));

// Pharmacy (Phase 2.2): drug schedule lookup for cart lines.
vi.mock("@/features/pharmacy/drug.api", () => ({
  useLazyGetDrugProductQuery: () => [
    vi.fn(() => ({ unwrap: () => Promise.resolve({ scheduleCategory: "OPEN" }) })),
    {},
  ],
}));

vi.mock("@/hooks/useBarcodeScanner", () => ({
  useBarcodeScanner: () => ({ resetBuffer: vi.fn() }),
}));

vi.mock("@/hooks/useSocketScanner", () => ({
  useSocketScanner: () => ({ connected: false, scanners: [] }),
}));

const STORE_ID = "store-1";

function makeProduct(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    tenantId: "t1",
    name: "Amoxicillin 500mg",
    slug: "amoxicillin-500mg",
    sku: "AMX-500",
    barcode: "0123456789",
    productType: ProductType.STANDARD,
    costPrice: "5.00",
    sellPrice: "12.50",
    taxCategory: "STANDARD",
    taxInclusive: false,
    isActive: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    storeStock: [{ storeId: STORE_ID, quantity: 20, lowStockThreshold: 5 }],
    productLevies: [
      {
        productId: "p1",
        levyId: "lv1",
        levy: {
          id: "lv1",
          code: "ENV",
          name: "Environmental Fee",
          mode: "FLAT_PER_UNIT",
          amount: "0.10",
          taxable: false,
          effectiveFrom: "2020-01-01T00:00:00.000Z",
          effectiveTo: null,
          isActive: true,
        },
      },
    ],
    ...over,
  };
}

function renderRingUp() {
  const store = configureStore({ reducer: { cart: cartReducer, auth: authReducer } });
  store.dispatch(
    setCredentials({
      accessToken: "tok",
      user: {
        id: "u1",
        email: "cashier@example.com",
        firstName: "Cash",
        lastName: "Ier",
        role: Role.CASHIER,
        storeId: STORE_ID,
      },
      tenant: null,
    }),
  );

  const { result } = renderHook(() => useRingUp(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });

  return { store, result };
}

describe("useRingUp", () => {
  beforeEach(() => {
    mockLookupTrigger.mockClear();
    mockLookupUnwrap.mockReset();
    mockCheckoutTrigger.mockClear();
    mockCheckoutUnwrap.mockReset();
    mockCheckoutUnwrap.mockResolvedValue({ id: "sale-1", invoiceNo: "INV-1" });
  });

  it("resolves the active store from the signed-in single-store user", () => {
    const { result } = renderRingUp();
    expect(result.current.effectiveStoreId).toBe(STORE_ID);
  });

  it("handleBarcodeScan on a resolved standard product dispatches addToCart with the mapped fields, incl. taxCategory/levies", async () => {
    const product = makeProduct();
    mockLookupUnwrap.mockResolvedValue({ product, matchedVariantId: null });
    const { store, result } = renderRingUp();

    await act(async () => {
      await result.current.handleBarcodeScan("0123456789");
    });

    expect(mockLookupTrigger).toHaveBeenCalledWith("0123456789", false);
    expect(store.getState().cart.items).toHaveLength(1);
    expect(store.getState().cart.items[0]).toMatchObject({
      id: "p1-none",
      productId: "p1",
      productType: ProductType.STANDARD,
      variantId: null,
      name: "Amoxicillin 500mg",
      sku: "AMX-500",
      unitPrice: 12.5,
      costPrice: 5,
      quantity: 1,
      discount: 0,
      taxCategory: "STANDARD",
      taxInclusive: false,
      levies: [
        {
          code: "ENV",
          name: "Environmental Fee",
          mode: "FLAT_PER_UNIT",
          amount: "0.10",
          taxable: false,
        },
      ],
      maxStock: 20,
    });
  });

  it("handleBarcodeScan rejects an out-of-stock product without dispatching addToCart", async () => {
    const product = makeProduct({
      storeStock: [{ storeId: STORE_ID, quantity: 0, lowStockThreshold: 5 }],
    });
    mockLookupUnwrap.mockResolvedValue({ product, matchedVariantId: null });
    const { store, result } = renderRingUp();

    await act(async () => {
      await result.current.handleBarcodeScan("0123456789");
    });

    expect(store.getState().cart.items).toHaveLength(0);
  });

  it("handleClearCart resets the cart and the cart-level discount UI state", () => {
    const { store, result } = renderRingUp();

    act(() => {
      result.current.applyCartDiscount("15", "percent");
    });
    expect(result.current.cartDiscountMode).toBe("percent");

    act(() => {
      result.current.handleClearCart();
    });

    expect(store.getState().cart.items).toHaveLength(0);
    expect(result.current.cartDiscountInput).toBe("");
  });

  it("handleCheckout collects line price-override grants + the cart discountOverride into `overrides`, rebuilding each context via priceOverrideCtx/discountOverCapCtx (Phase 1.3a, Task 14/9 — this MUST byte-match the request-time context or the backend's consumeOverride hash check fails closed)", async () => {
    const { store, result } = renderRingUp();

    act(() => {
      store.dispatch(
        addToCart({
          id: "line-1",
          productId: "p1",
          name: "Amoxicillin 500mg",
          sku: "AMX-500",
          unitPrice: 12.5,
          costPrice: 5,
          quantity: 1,
          discount: 0,
          taxCategory: "STANDARD",
          taxInclusive: false,
          levies: [],
          maxStock: 10,
        }),
      );
      // Mirrors what PriceOverrideModal dispatches on a granted PIN — the
      // reducer snapshots the PRE-override unitPrice (12.5) as
      // priceOverride.originalPrice before overwriting unitPrice with 9.99.
      store.dispatch(
        overrideLinePrice({
          id: "line-1",
          newPrice: 9.99,
          grant: "grant-price-1",
          authorizerUserId: "mgr-1",
        }),
      );
    });

    // Task 16: an over-cap cart discount goes through the gate — record via
    // applyCartDiscount + handleGateGranted (the real app flow) rather than
    // dispatching setDiscountOverride directly, so the recorded grant's
    // context (mode:"percent", value:15) actually matches the committed
    // cartDiscount handleCheckout will rebuild from below (a mismatched
    // combination — e.g. a grant minted for one value applied to a
    // DIFFERENT, unrelated discount — is exactly what Task 16's gating
    // guards against; see useRingUp.gates.test.tsx).
    act(() => {
      result.current.applyCartDiscount("15", "percent");
    });
    act(() => {
      result.current.handleGateGranted("grant-discount-1", "mgr-2");
    });

    act(() => {
      result.current.setPayments([{ method: PaymentMethod.CASH, amount: 9999 }]);
    });

    await act(async () => {
      await result.current.handleCheckout();
    });

    expect(mockCheckoutTrigger).toHaveBeenCalledTimes(1);
    const payload = mockCheckoutTrigger.mock.calls[0][0] as {
      overrides?: { action: string; context: string; grant: string }[];
    };
    // priceOverrideCtx("p1", 12.5 /* originalPrice */, 9.99 /* current unitPrice */)
    // — byte-identical to what PriceOverrideModal requested the grant for
    // (productId, line.unitPrice-before-override, newPrice).
    expect(payload.overrides).toEqual([
      { action: "PRICE_OVERRIDE", context: "p1:12.5->9.99", grant: "grant-price-1" },
      { action: "DISCOUNT_OVER_CAP", context: "percent:15", grant: "grant-discount-1" },
    ]);
  });

  it("clearing the cart discount after an over-cap grant drops the stale discountOverride, so checkout does NOT ride a mismatched grant (Task 16 fix — the reported fail-closed repro)", async () => {
    const { store, result } = renderRingUp();

    act(() => {
      store.dispatch(setStoreProvince("ON"));
      store.dispatch(
        addToCart({
          id: "line-1",
          productId: "p1",
          name: "Amoxicillin 500mg",
          sku: "AMX-500",
          unitPrice: 100,
          costPrice: 50,
          quantity: 1,
          discount: 0,
          taxCategory: "STANDARD",
          taxInclusive: false,
          levies: [],
          maxStock: 10,
        }),
      );
    });

    // Apply and grant a 25% over-cap cart discount (manager approves).
    act(() => {
      result.current.applyCartDiscount("25", "percent");
    });
    act(() => {
      result.current.handleGateGranted("grant-discount-x", "mgr-1");
    });
    expect(store.getState().cart.discountOverride).toMatchObject({ mode: "percent", value: 25 });
    expect(result.current.cartDiscountNum).toBeCloseTo(25);

    // Repro: cashier clicks the "Clear" link under the discount input.
    act(() => {
      result.current.handleClearCartDiscountInput();
    });

    // The stale grant must be dropped the instant the committed discount
    // diverges from what it was granted for — otherwise handleCheckout
    // rebuilds "percent:0" while the grant was minted for "percent:25", and
    // the backend's consumeOverride hash check fails closed, rejecting the
    // ENTIRE sale.
    expect(store.getState().cart.discountOverride).toBeFalsy();
    expect(result.current.cartDiscountNum).toBe(0);

    act(() => {
      result.current.setPayments([{ method: PaymentMethod.CASH, amount: 9999 }]);
    });

    await act(async () => {
      await result.current.handleCheckout();
    });

    expect(mockCheckoutTrigger).toHaveBeenCalledTimes(1);
    const payload = mockCheckoutTrigger.mock.calls[0][0] as {
      overrides?: { action: string; context: string; grant: string }[];
    };
    expect(payload.overrides ?? []).not.toContainEqual(
      expect.objectContaining({ action: "DISCOUNT_OVER_CAP" }),
    );
  });
});
