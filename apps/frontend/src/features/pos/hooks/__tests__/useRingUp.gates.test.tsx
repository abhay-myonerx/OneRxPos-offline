import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import cartReducer, { addToCart, setStoreProvince } from "../../state/cart.slice";
import authReducer, { setCredentials } from "@/store/auth.slice";
import { Role } from "@/types/enums/role.enums";
import { ProductType } from "@/types/enums/status.enums";
import { useRingUp } from "../useRingUp";

// ── Mocks ────────────────────────────────────────────────────────────────
// Mirrors useRingUp.test.tsx's mocking pattern — pure unit test of the
// hook's own gating orchestration (Phase 1.3a, Task 16). Adds mocks for
// `useGetMeQuery` (discountCaps source) and `useConsumeOverrideMutation`
// (void/clear grant consumption) on top of the existing RTK Query mocks.

vi.mock("@/features/products/api/products.api", () => ({
  useListProductsQuery: () => ({ data: { data: [], pagination: {} }, isLoading: false }),
  useLazyLookupByBarcodeQuery: () => [vi.fn(() => ({ unwrap: vi.fn() })), { isFetching: false }],
}));

vi.mock("@/features/customers/api/customers.api", () => ({
  useListCustomersQuery: () => ({ data: { data: [] } }),
  useCreateCustomerMutation: () => [vi.fn(), { isLoading: false }],
  useListGroupsQuery: () => ({ data: [] }),
  useGetLoyaltyProgramQuery: () => ({ data: undefined }),
}));

vi.mock("@/features/sales/api/sales.api", () => ({
  useCheckoutMutation: () => [vi.fn(() => ({ unwrap: vi.fn() })), { isLoading: false }],
}));

vi.mock("@/features/stores/api/stores.api", () => ({
  useGetStoreQuery: () => ({ data: undefined }),
}));

vi.mock("@/hooks/useBarcodeScanner", () => ({
  useBarcodeScanner: () => ({ resetBuffer: vi.fn() }),
}));

vi.mock("@/hooks/useSocketScanner", () => ({
  useSocketScanner: () => ({ connected: false, scanners: [] }),
}));

// No discountCaps override configured — useRingUp must fall back to
// DEFAULT_ROLE_CAPS (CASHIER: 10% cap).
vi.mock("@/features/auth/api/auth.api", () => ({
  useGetMeQuery: () => ({ data: undefined }),
}));

const mockConsumeUnwrap = vi.fn();
const mockConsumeTrigger = vi.fn((_body: unknown) => ({ unwrap: mockConsumeUnwrap }));

vi.mock("@/features/pos/api/pos.api", () => ({
  useConsumeOverrideMutation: () => [mockConsumeTrigger, { isLoading: false }],
  // Suspend/resume endpoints (Phase 1.3b) — stubbed; this suite drives the gate flows.
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

const STORE_ID = "store-1";

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

function seedLine(store: ReturnType<typeof renderRingUp>["store"]) {
  // Wrapped in `act` so the hook's `useAppSelector(cart)` view is guaranteed
  // to reflect this update before the next synchronous `act()` call in the
  // test body reads `result.current` (a bare, unwrapped dispatch risks a
  // stale `cart.items` read in the same tick).
  act(() => {
    store.dispatch(setStoreProvince("ON"));
    store.dispatch(
      addToCart({
        id: "line-1",
        productId: "p1",
        productType: ProductType.STANDARD,
        variantId: null,
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
}

describe("useRingUp gating (Phase 1.3a, Task 16)", () => {
  beforeEach(() => {
    mockConsumeTrigger.mockClear();
    mockConsumeUnwrap.mockReset();
  });

  describe("discount-cap gating", () => {
    it("a 15% cart discount (over the cashier's 10% cap) opens the override gate and holds off applying", () => {
      const { store, result } = renderRingUp();
      seedLine(store);

      act(() => {
        result.current.applyCartDiscount("15", "percent");
      });

      expect(result.current.pendingGate).not.toBeNull();
      expect(result.current.pendingGate?.ctx).toEqual({
        action: "DISCOUNT_OVER_CAP",
        context: "percent:15",
      });
      // Not applied yet — no grant recorded, totals still reflect no discount.
      expect(store.getState().cart.discountOverride).toBeFalsy();
      expect(result.current.cartDiscountNum).toBe(0);
    });

    it("on a mocked grant, records setDiscountOverride and THEN applies the over-cap discount", () => {
      const { store, result } = renderRingUp();
      seedLine(store);

      act(() => {
        result.current.applyCartDiscount("15", "percent");
      });
      act(() => {
        result.current.handleGateGranted("grant-discount-1", "mgr-1");
      });

      expect(store.getState().cart.discountOverride).toEqual({
        grant: "grant-discount-1",
        authorizerUserId: "mgr-1",
        mode: "percent",
        value: 15,
      });
      expect(result.current.pendingGate).toBeNull();
      // 15% of a $100 line == $15 cart discount, now committed.
      expect(result.current.cartDiscountNum).toBeCloseTo(15);
    });

    it("a 5% cart discount (within the cashier's 10% cap) applies directly — no override gate", () => {
      const { store, result } = renderRingUp();
      seedLine(store);

      act(() => {
        result.current.applyCartDiscount("5", "percent");
      });

      expect(result.current.pendingGate).toBeNull();
      expect(store.getState().cart.discountOverride).toBeFalsy();
      expect(result.current.cartDiscountNum).toBeCloseTo(5);
    });

    it("requesting a DIFFERENT over-cap value/mode while a grant is already recorded clears the stale grant immediately (a fresh grant is required — Task 16 fix)", () => {
      const { store, result } = renderRingUp();
      seedLine(store);

      // Grant a 25% over-cap discount — committed and recorded.
      act(() => {
        result.current.applyCartDiscount("25", "percent");
      });
      act(() => {
        result.current.handleGateGranted("grant-discount-25", "mgr-1");
      });
      expect(store.getState().cart.discountOverride).toEqual({
        grant: "grant-discount-25",
        authorizerUserId: "mgr-1",
        mode: "percent",
        value: 25,
      });
      expect(result.current.cartDiscountMode).toBe("percent");

      // Cashier now toggles to a different mode/value ($30 flat, also
      // over-cap) before granting anything new. `applyCartDiscount` commits
      // the new MODE immediately (unconditionally, ahead of the cap check)
      // while holding the new VALUE behind a fresh gate — so the previously
      // committed cartDiscount (25) is now paired with cartDiscountMode
      // "flat" instead of "percent", diverging from the still-recorded
      // grant (mode:"percent", value:25). The reconciliation effect must
      // drop that stale grant the instant this happens, so it can never
      // ride into checkout mismatched against the current committed state.
      act(() => {
        result.current.applyCartDiscount("30", "flat");
      });

      expect(result.current.pendingGate?.ctx).toEqual({
        action: "DISCOUNT_OVER_CAP",
        context: "flat:30",
      });
      expect(result.current.cartDiscountMode).toBe("flat");
      expect(store.getState().cart.discountOverride).toBeFalsy();
      // The $30 flat request isn't committed until its own fresh gate is
      // granted — the previously committed $25 (now labeled "flat") is what
      // totals still reflect.
      expect(result.current.cartDiscountNum).toBeCloseTo(25);
    });
  });

  describe("void-line gating", () => {
    it("voiding a non-empty line opens the override gate and does not remove it yet", () => {
      const { store, result } = renderRingUp();
      seedLine(store);
      const item = store.getState().cart.items[0];

      act(() => {
        result.current.handleRemoveItem(item);
      });

      expect(result.current.pendingGate).not.toBeNull();
      expect(result.current.pendingGate?.ctx).toEqual({ action: "VOID_LINE", context: "p1" });
      expect(store.getState().cart.items).toHaveLength(1);
      expect(mockConsumeTrigger).not.toHaveBeenCalled();
    });

    it("on grant, calls the consume mutation and THEN voids the line", async () => {
      mockConsumeUnwrap.mockResolvedValue({ consumed: true });
      const { store, result } = renderRingUp();
      seedLine(store);
      const item = store.getState().cart.items[0];

      act(() => {
        result.current.handleRemoveItem(item);
      });

      await act(async () => {
        await result.current.handleGateGranted("grant-void-1", "mgr-1");
      });

      expect(mockConsumeTrigger).toHaveBeenCalledWith({
        action: "VOID_LINE",
        context: "p1",
        grant: "grant-void-1",
      });
      expect(store.getState().cart.items).toHaveLength(0);
    });

    it("does NOT void the line when the consume mutation rejects (tampered/expired grant)", async () => {
      mockConsumeUnwrap.mockRejectedValue({ status: 400, data: { consumed: false } });
      const { store, result } = renderRingUp();
      seedLine(store);
      const item = store.getState().cart.items[0];

      act(() => {
        result.current.handleRemoveItem(item);
      });

      await act(async () => {
        await result.current.handleGateGranted("grant-bad", "mgr-1");
      });

      expect(store.getState().cart.items).toHaveLength(1);
    });
  });

  describe("clear-transaction gating", () => {
    it("clearing a non-empty cart opens the override gate; on grant, consumes THEN clears", async () => {
      mockConsumeUnwrap.mockResolvedValue({ consumed: true });
      const { store, result } = renderRingUp();
      seedLine(store);

      act(() => {
        result.current.handleClearCart();
      });

      expect(result.current.pendingGate).not.toBeNull();
      expect(result.current.pendingGate?.ctx).toEqual({
        action: "VOID_TRANSACTION",
        context: "count:1",
      });
      expect(store.getState().cart.items).toHaveLength(1);

      await act(async () => {
        await result.current.handleGateGranted("grant-clear-1", "mgr-1");
      });

      expect(mockConsumeTrigger).toHaveBeenCalledWith({
        action: "VOID_TRANSACTION",
        context: "count:1",
        grant: "grant-clear-1",
      });
      expect(store.getState().cart.items).toHaveLength(0);
    });
  });

  describe("line discount-cap gating", () => {
    it("a line discount exceeding the line's cap opens the gate and holds off applying", () => {
      const { store, result } = renderRingUp();
      seedLine(store);
      const item = store.getState().cart.items[0];

      // $15 flat on a $100 line == 15% effective, over the 10% cashier cap.
      act(() => {
        result.current.handleDiscountChange(item.id, 15);
      });

      expect(result.current.pendingGate).not.toBeNull();
      expect(store.getState().cart.items[0].discount).toBe(0);
    });

    it("on grant, applies the line discount directly (no checkout-side grant storage)", () => {
      const { store, result } = renderRingUp();
      seedLine(store);
      const item = store.getState().cart.items[0];

      act(() => {
        result.current.handleDiscountChange(item.id, 15);
      });
      act(() => {
        result.current.handleGateGranted("grant-line-discount-1", "mgr-1");
      });

      expect(store.getState().cart.items[0].discount).toBe(15);
    });

    it("a line discount within the cap applies directly — no gate", () => {
      const { store, result } = renderRingUp();
      seedLine(store);
      const item = store.getState().cart.items[0];

      act(() => {
        result.current.handleDiscountChange(item.id, 5);
      });

      expect(result.current.pendingGate).toBeNull();
      expect(store.getState().cart.items[0].discount).toBe(5);
    });
  });
});
