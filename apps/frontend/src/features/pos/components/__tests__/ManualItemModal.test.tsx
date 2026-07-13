import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n/i18n";
import cartReducer from "@/features/pos/state/cart.slice";
import { ManualItemModal } from "../ManualItemModal";

// ── ManualItemModal ──────────────────────────────────────────────────────────
// Phase 1.3a, Task 15. Mirrors PriceOverrideModal.test.tsx's mocking of
// useRequestOverrideMutation/getLaneFingerprint (this component composes the
// 1.1 OverrideModal for the PIN step) and useListUsersQuery (the authorizer
// picker), plus mocks the misc-product fetch (Task 9's GET /products/misc,
// wired here via pos.api.ts's useGetMiscProductQuery).

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

interface MockMiscProductQueryResult {
  data: { id: string } | undefined;
  isLoading: boolean;
  isError: boolean;
}

const mockUseGetMiscProductQuery = vi.fn<() => MockMiscProductQueryResult>(() => ({
  data: { id: "misc-1" },
  isLoading: false,
  isError: false,
}));

vi.mock("@/features/pos/api/pos.api", () => ({
  useGetMiscProductQuery: () => mockUseGetMiscProductQuery(),
}));

function renderModal(overrides: Partial<React.ComponentProps<typeof ManualItemModal>> = {}) {
  const store = configureStore({ reducer: { cart: cartReducer } });
  const onClose = vi.fn();
  render(
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <ManualItemModal open onClose={onClose} {...overrides} />
      </I18nextProvider>
    </Provider>,
  );
  return { store, onClose };
}

async function clickDigits(digits: string) {
  for (const d of digits) {
    await userEvent.click(screen.getByRole("button", { name: d }));
  }
}

describe("ManualItemModal", () => {
  beforeEach(() => {
    mockTrigger.mockClear();
    mockUnwrap.mockReset();
    mockGetLaneFingerprint.mockClear();
    mockUseGetMiscProductQuery.mockReturnValue({
      data: { id: "misc-1" },
      isLoading: false,
      isError: false,
    });
  });

  it("collects description/price/tax category + authorizer, requests the OPEN_PRICE_ITEM grant bound to the entered price/description context, and on grant dispatches addMiscItem with a line referencing the misc product id", async () => {
    mockUnwrap.mockResolvedValue({ grant: "grant-token-xyz" });
    const { store } = renderModal();

    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Repair fee" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "12.5" } });
    await userEvent.selectOptions(screen.getByLabelText("Tax Category"), "ZERO_RATED");
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
        action: "OPEN_PRICE_ITEM",
        authorizerUserId: "mgr-1",
        pin: "428193",
        deviceFingerprint: "fp-test-123",
        // price:description — the SAME openPriceItemCtx builder + inputs
        // useRingUp.handleCheckout rebuilds from the resulting line's
        // unitPrice/name at checkout time.
        context: "12.5:Repair fee",
      });
    });

    await waitFor(() => {
      expect(store.getState().cart.items).toHaveLength(1);
    });
    const stored = store.getState().cart.items[0];
    expect(stored).toMatchObject({
      productId: "misc-1",
      name: "Repair fee",
      unitPrice: 12.5,
      taxCategory: "ZERO_RATED",
      isMisc: true,
    });
    expect(stored.priceOverride).toEqual({
      originalPrice: 0,
      grant: "grant-token-xyz",
      authorizerUserId: "mgr-1",
    });
  });

  it("disables Continue until description, a valid price, and an authorizer are all set", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByRole("dialog", { hidden: true })).toHaveClass("opacity-100");
    });

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Repair fee" } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "12.5" } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText("Authorizer"), "mgr-1");
    expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled();
  });

  it("does not dispatch addMiscItem when the PIN entry fails", async () => {
    mockUnwrap.mockRejectedValue({
      status: 401,
      data: { success: false, error: { code: "AUTHENTICATION_ERROR", message: "Invalid authorizer or PIN" } },
    });
    const { store } = renderModal();

    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Repair fee" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "12.5" } });
    await userEvent.selectOptions(screen.getByLabelText("Authorizer"), "mgr-1");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { hidden: true })).toHaveClass("opacity-100");
    });
    await clickDigits("111111");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(store.getState().cart.items).toHaveLength(0);
  });

  // ── Review fix: misc product unavailable ──────────────────────────────────
  // Regression test for the silent-loss bug: previously, if the misc-product
  // fetch hadn't resolved (or had errored) by the time the manager's PIN
  // grant landed, `handleGranted`'s `if (miscProduct?.id)` guard silently
  // skipped `dispatch(addMiscItem(...))` and STILL called `reset(); onClose()`
  // — the modal closed as if successful but no line was ever added. The fix
  // gates Continue on the misc product being loaded, and defends inside
  // `handleGranted` too.

  it("disables Continue while the misc-product query is loading, even once description/price/authorizer are valid", async () => {
    mockUseGetMiscProductQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderModal();

    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Repair fee" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "12.5" } });
    await userEvent.selectOptions(screen.getByLabelText("Authorizer"), "mgr-1");

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("disables Continue and surfaces an inline error when the misc-product query has errored — never a silent no-op close", async () => {
    mockUseGetMiscProductQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { store, onClose } = renderModal();

    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Repair fee" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "12.5" } });
    await userEvent.selectOptions(screen.getByLabelText("Authorizer"), "mgr-1");

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/unavailable/i);

    // Never reaches the PIN step, never dispatches, never closes.
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(store.getState().cart.items).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });
});
