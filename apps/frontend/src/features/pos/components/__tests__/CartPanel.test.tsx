import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CartPanel, type CartPanelProps } from "../CartPanel";
import { computeCartTotals } from "@/features/pos/helpers/checkout-math";
import type { CartItem, CartState } from "@/features/pos/types/cart.types";

// ── CartPanel ────────────────────────────────────────────────────────────────
// Presentational — all state/handlers come from useRingUp as props. Mirrors
// CartRow.test.tsx / CartTotals.test.tsx (render tests moved out of page.tsx,
// Phase 1.3a decomposition, Task 11).

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
  items: [item()],
  customerId: null,
  storeId: null,
  shiftId: null,
  notes: "",
  storeProvince: null,
  discountOverride: null,
  ...over,
});

function renderPanel(over: Partial<CartPanelProps> = {}) {
  const items = over.cart?.items ?? [item()];
  const totals = computeCartTotals(items, 0, "flat", "ON");
  const props: CartPanelProps = {
    cart: cartState({ items }),
    customers: [],
    handleClearCart: vi.fn(),
    handleCustomerChange: vi.fn(),
    setQuickCreateOpen: vi.fn(),
    expandedItemId: null,
    setExpandedItemId: vi.fn(),
    handleQuantityChange: vi.fn(),
    handleDiscountChange: vi.fn(),
    handleRemoveItem: vi.fn(),
    totalQty: totals.totalQty,
    groupDiscountBanner: null,
    handleClearGroupDiscount: vi.fn(),
    showCartDiscount: false,
    setShowCartDiscount: vi.fn(),
    cartDiscountNum: 0,
    cartDiscountMode: "flat",
    cartDiscountInput: "",
    applyCartDiscount: vi.fn(),
    handleClearCartDiscountInput: vi.fn(),
    totals,
    effectiveStoreId: "store-1",
    handleOpenPaymentModal: vi.fn(),
    grandTotalNum: totals.grandTotal.toNumber(),
    ...over,
  };
  render(<CartPanel {...props} />);
  return props;
}

describe("CartPanel", () => {
  it("shows the empty-cart placeholder when there are no items", () => {
    renderPanel({ cart: cartState({ items: [] }) });

    expect(screen.getByText("Cart is empty")).toBeInTheDocument();
    // Clear All + CartTotals + Charge button only render once there are items
    expect(screen.queryByText("Clear All")).not.toBeInTheDocument();
  });

  it("renders a CartRow per cart item and routes its callbacks through the ring-up handlers", async () => {
    const props = renderPanel();

    expect(screen.getByText("Amoxicillin 500mg")).toBeInTheDocument();

    // CartRow button order: [0] row-toggle, [1] minus, [2] plus, [3] remove
    const buttons = screen.getAllByRole("button");
    const minusButton = buttons.find((b) => b.querySelector("svg.lucide-minus"));
    await userEvent.click(minusButton!);

    expect(props.handleQuantityChange).toHaveBeenCalledWith(item(), 1);
  });

  it("calls handleClearCart when Clear All is clicked", async () => {
    const props = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Clear All" }));

    expect(props.handleClearCart).toHaveBeenCalledTimes(1);
  });

  it("calls handleOpenPaymentModal when Charge is clicked", async () => {
    const props = renderPanel();
    const chargeButton = screen.getByRole("button", { name: /Charge/ });
    expect(chargeButton).not.toBeDisabled();

    await userEvent.click(chargeButton);

    expect(props.handleOpenPaymentModal).toHaveBeenCalledTimes(1);
  });

  it("disables the Charge button when no store is selected", () => {
    renderPanel({ effectiveStoreId: null });

    expect(screen.getByRole("button", { name: /Charge/ })).toBeDisabled();
  });

  it("shows the auto-applied group discount banner and clears it via its dismiss button", async () => {
    const props = renderPanel({
      groupDiscountBanner: { groupName: "Wholesale", percent: "10" },
    });

    expect(screen.getByText(/Wholesale discount \(10%\) auto-applied/)).toBeInTheDocument();

    await userEvent.click(screen.getByTitle("Remove group discount"));
    expect(props.handleClearGroupDiscount).toHaveBeenCalledTimes(1);
  });
});
