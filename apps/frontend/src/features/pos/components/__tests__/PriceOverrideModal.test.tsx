import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n/i18n";
import cartReducer, { addToCart } from "@/features/pos/state/cart.slice";
import type { CartItem } from "@/features/pos/types/cart.types";
import { PriceOverrideModal } from "../PriceOverrideModal";

// ── PriceOverrideModal ───────────────────────────────────────────────────────
// Phase 1.3a, Task 14. Mirrors OverrideModal.test.tsx's mocking of
// useRequestOverrideMutation/getLaneFingerprint (this component composes the
// 1.1 OverrideModal for the PIN step) and additionally mocks useListUsersQuery
// (the authorizer picker).

const mockUnwrap = vi.fn();
const mockTrigger = vi.fn(() => ({ unwrap: mockUnwrap }));
const mockGetLaneFingerprint = vi.fn(() => Promise.resolve("fp-test-123"));

vi.mock("@/features/pos-auth/api/pos-auth.api", () => ({
  useRequestOverrideMutation: () => [mockTrigger, { isLoading: false }],
  getLaneFingerprint: () => mockGetLaneFingerprint(),
}));

vi.mock("@/features/users/api/users.api", () => ({
  useListUsersQuery: () => ({
    data: {
      data: [{ id: "mgr-1", firstName: "Mona", lastName: "Manager" }],
      pagination: {},
    },
  }),
}));

const line: CartItem = {
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
};

function renderModal(overrides: Partial<React.ComponentProps<typeof PriceOverrideModal>> = {}) {
  const store = configureStore({ reducer: { cart: cartReducer } });
  store.dispatch(addToCart(line));
  const onClose = vi.fn();
  const onApplied = vi.fn();
  render(
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <PriceOverrideModal
          line={line}
          open
          onClose={onClose}
          onApplied={onApplied}
          {...overrides}
        />
      </I18nextProvider>
    </Provider>,
  );
  return { store, onClose, onApplied };
}

async function clickDigits(digits: string) {
  for (const d of digits) {
    await userEvent.click(screen.getByRole("button", { name: d }));
  }
}

describe("PriceOverrideModal", () => {
  beforeEach(() => {
    mockTrigger.mockClear();
    mockUnwrap.mockReset();
    mockGetLaneFingerprint.mockClear();
  });

  it("collects a new price + authorizer, requests the PRICE_OVERRIDE grant bound to the current->new price context, and on grant dispatches overrideLinePrice + calls onApplied", async () => {
    mockUnwrap.mockResolvedValue({ grant: "grant-token-xyz" });
    const { store, onApplied } = renderModal();

    fireEvent.change(screen.getByLabelText("New price"), { target: { value: "9.99" } });
    await userEvent.selectOptions(screen.getByLabelText("Authorizer"), "mgr-1");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    // The 1.1 OverrideModal mounts hidden and flips to visible via a double
    // requestAnimationFrame — wait for that before entering the PIN (see
    // OverrideModal.test.tsx).
    await waitFor(() => {
      expect(screen.getByRole("dialog", { hidden: true })).toHaveClass("opacity-100");
    });

    await clickDigits("428193");

    await waitFor(() => {
      expect(mockTrigger).toHaveBeenCalledWith({
        action: "PRICE_OVERRIDE",
        authorizerUserId: "mgr-1",
        pin: "428193",
        deviceFingerprint: "fp-test-123",
        // productId:oldPrice->newPrice — oldPrice is the line's CURRENT
        // (pre-override) unitPrice, same builder useRingUp.handleCheckout
        // rebuilds from priceOverride.originalPrice/unitPrice at checkout.
        context: "p1:12.5->9.99",
      });
    });

    await waitFor(() => {
      const stored = store.getState().cart.items.find((i) => i.id === "line-1");
      expect(stored?.unitPrice).toBe(9.99);
      expect(stored?.priceOverride).toEqual({
        originalPrice: 12.5,
        grant: "grant-token-xyz",
        authorizerUserId: "mgr-1",
      });
    });
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it("disables Continue until both a valid new price and an authorizer are chosen", async () => {
    renderModal();

    // Modal mounts hidden and flips to visible via a double rAF transition —
    // wait for that before querying for accessible roles.
    await waitFor(() => {
      expect(screen.getByRole("dialog", { hidden: true })).toHaveClass("opacity-100");
    });

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("New price"), { target: { value: "9.99" } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText("Authorizer"), "mgr-1");
    expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled();
  });

  it("does not dispatch overrideLinePrice or call onApplied when the PIN entry fails", async () => {
    mockUnwrap.mockRejectedValue({
      status: 401,
      data: { success: false, error: { code: "AUTHENTICATION_ERROR", message: "Invalid authorizer or PIN" } },
    });
    const { store, onApplied } = renderModal();

    fireEvent.change(screen.getByLabelText("New price"), { target: { value: "9.99" } });
    await userEvent.selectOptions(screen.getByLabelText("Authorizer"), "mgr-1");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { hidden: true })).toHaveClass("opacity-100");
    });
    await clickDigits("111111");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onApplied).not.toHaveBeenCalled();
    const stored = store.getState().cart.items.find((i) => i.id === "line-1");
    expect(stored?.priceOverride).toBeUndefined();
  });
});
