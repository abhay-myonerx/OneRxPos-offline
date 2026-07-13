import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CartTotals } from "../CartTotals";
import { computeCartTotals } from "@/features/pos/helpers/checkout-math";
import type { CartItem } from "@/features/pos/types/cart.types";

const item = (over: Partial<CartItem> = {}): CartItem => ({
  id: "1",
  productId: "p1",
  name: "x",
  sku: "x",
  unitPrice: 100,
  costPrice: 0,
  quantity: 1,
  discount: 0,
  taxCategory: "STANDARD",
  taxInclusive: false,
  levies: [],
  maxStock: 99,
  ...over,
});

describe("CartTotals", () => {
  it("renders subtotal, tax, and grand total from a real computeCartTotals result", () => {
    const totals = computeCartTotals([item({})], 0, "flat", "ON");

    render(<CartTotals totals={totals} cartDiscountMode="flat" cartDiscountInput="" />);

    expect(screen.getByText(/Subtotal \(1 item\)/)).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("Tax")).toBeInTheDocument();
    expect(screen.getByText("+$13.00")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("$113.00")).toBeInTheDocument();
  });

  it("hides the tax and item-discount rows when there is no tax/discount (no province resolved)", () => {
    const totals = computeCartTotals([item({ unitPrice: 50, quantity: 2 })], 0, "flat", null);

    render(<CartTotals totals={totals} cartDiscountMode="flat" cartDiscountInput="" />);

    expect(screen.queryByText("Tax")).not.toBeInTheDocument();
    expect(screen.queryByText("Item Discounts")).not.toBeInTheDocument();
    // grand total falls back to the subtotal when tax/discount are zero
    expect(screen.getAllByText("$100.00")).toHaveLength(2);
  });

  it("shows item discounts and pluralizes the subtotal label for multiple items", () => {
    const totals = computeCartTotals(
      [item({ id: "1", quantity: 2, discount: 5 }), item({ id: "2", quantity: 1 })],
      0,
      "flat",
      "ON",
    );

    render(<CartTotals totals={totals} cartDiscountMode="flat" cartDiscountInput="" />);

    expect(screen.getByText(/Subtotal \(3 items\)/)).toBeInTheDocument();
    expect(screen.getByText("Item Discounts")).toBeInTheDocument();
    expect(screen.getByText("-$5.00")).toBeInTheDocument();
  });

  it("shows a percent cart discount with the mode's label suffix", () => {
    const totals = computeCartTotals([item({ unitPrice: 100, quantity: 1 })], 10, "percent", "ON");

    render(<CartTotals totals={totals} cartDiscountMode="percent" cartDiscountInput="10" />);

    expect(screen.getByText(/Cart Discount/)).toBeInTheDocument();
    expect(screen.getByText(/\(10%\)/)).toBeInTheDocument();
    expect(screen.getByText("-$10.00")).toBeInTheDocument();
  });
});
