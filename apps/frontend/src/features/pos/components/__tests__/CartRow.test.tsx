import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CartRow } from "../CartRow";
import type { CartItem } from "@/features/pos/types/cart.types";

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

function renderRow(over: Partial<CartItem> = {}, extra: Record<string, unknown> = {}) {
  const onToggle = vi.fn();
  const onQuantity = vi.fn();
  const onDiscount = vi.fn();
  const onRemove = vi.fn();
  render(
    <CartRow
      item={item(over)}
      isExpanded={false}
      onToggle={onToggle}
      onQuantity={onQuantity}
      onDiscount={onDiscount}
      onRemove={onRemove}
      {...extra}
    />,
  );
  return { onToggle, onQuantity, onDiscount, onRemove };
}

describe("CartRow", () => {
  it("shows the item name, unit price × qty, and the computed line total", () => {
    renderRow();

    expect(screen.getByText("Amoxicillin 500mg")).toBeInTheDocument();
    // unitPrice 12.50 × qty 2
    expect(screen.getByText(/\$12\.50/)).toBeInTheDocument();
    expect(screen.getByText(/× 2/)).toBeInTheDocument();
    // lineTotal = 12.50 * 2 - 0 = 25.00 (display-only, not authoritative)
    expect(screen.getByText("$25.00")).toBeInTheDocument();
  });

  it("subtracts the line discount from the displayed line total", () => {
    renderRow({ discount: 5 });

    // lineTotal = 12.50 * 2 - 5 = 20.00
    expect(screen.getByText("$20.00")).toBeInTheDocument();
    expect(screen.getByText(/-\$5\.00/)).toBeInTheDocument();
  });

  it("calls onToggle when the row header is clicked", async () => {
    const { onToggle } = renderRow();

    await userEvent.click(screen.getByText("Amoxicillin 500mg"));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onQuantity with quantity - 1 when the minus button is clicked", async () => {
    const { onQuantity } = renderRow({ quantity: 3 });

    // Button order: [0] row-toggle, [1] minus, [2] plus, [3] remove
    const buttons = screen.getAllByRole("button");
    await userEvent.click(buttons[1]);

    expect(onQuantity).toHaveBeenCalledWith(2);
  });

  it("commits a typed quantity on blur, clamped to maxStock", async () => {
    const { onQuantity } = renderRow({ quantity: 2, maxStock: 10 });

    const qtyInput = screen.getByDisplayValue("2");
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, "15");
    qtyInput.blur();

    expect(onQuantity).toHaveBeenCalledWith(10);
  });

  it("commits a typed quantity on Enter, clamped to a minimum of 1", async () => {
    const { onQuantity } = renderRow({ quantity: 2, maxStock: 10 });

    const qtyInput = screen.getByDisplayValue("2");
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, "0{enter}");

    expect(onQuantity).toHaveBeenCalledWith(1);
  });

  it("does not call onQuantity when the typed value is unchanged from the current quantity", async () => {
    const { onQuantity } = renderRow({ quantity: 2, maxStock: 10 });

    const qtyInput = screen.getByDisplayValue("2");
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, "2");
    qtyInput.blur();

    expect(onQuantity).not.toHaveBeenCalled();
  });

  it("disables the plus button and shows 'Max reached' once quantity hits maxStock", () => {
    renderRow({ quantity: 10, maxStock: 10 });

    expect(screen.getByText(/Max reached/)).toBeInTheDocument();
  });

  it("suppresses the stock badge for unlimited stock (maxStock >= 999)", () => {
    renderRow({ quantity: 1, maxStock: 999 });

    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Max reached/)).not.toBeInTheDocument();
  });

  it("shows SKU and stock details only when expanded", () => {
    const { rerender } = render(
      <CartRow
        item={item()}
        isExpanded={false}
        onToggle={vi.fn()}
        onQuantity={vi.fn()}
        onDiscount={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByText(/SKU:/)).not.toBeInTheDocument();

    rerender(
      <CartRow
        item={item()}
        isExpanded={true}
        onToggle={vi.fn()}
        onQuantity={vi.fn()}
        onDiscount={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText("SKU: AMX-500")).toBeInTheDocument();
  });
});
