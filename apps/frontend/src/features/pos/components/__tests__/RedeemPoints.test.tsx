import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RedeemPoints } from "../RedeemPoints";

const base = { availablePoints: 500, redeemRate: 0.1, minRedeemPoints: 100, grandTotal: 100, applied: 0 };

describe("RedeemPoints", () => {
  it("hides when the customer has fewer than the minimum points", () => {
    const { container } = render(<RedeemPoints {...base} availablePoints={50} onApply={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows max redeemable value capped at the sale total", () => {
    // 500 pts × $0.10 = $50, but the sale is $100 → cap is $50 here (points-limited)
    render(<RedeemPoints {...base} onApply={vi.fn()} />);
    expect(screen.getByText(/redeem up to \$50\.00/)).toBeInTheDocument();
  });

  it("caps by the sale total when points are worth more than the total", () => {
    render(<RedeemPoints {...base} availablePoints={5000} grandTotal={100} onApply={vi.fn()} />);
    // 5000 × 0.1 = $500 but total is $100 → capped at $100
    expect(screen.getByText(/redeem up to \$100\.00/)).toBeInTheDocument();
  });

  it("applies an entered amount and disables below the minimum", () => {
    const onApply = vi.fn();
    render(<RedeemPoints {...base} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText("Points to redeem"), { target: { value: "50" } });
    expect(screen.getByRole("button", { name: /^Redeem$/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Points to redeem"), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: /^Redeem$/ }));
    expect(onApply).toHaveBeenCalledWith(200);
  });

  it("shows the applied redemption and can remove it", () => {
    const onApply = vi.fn();
    render(<RedeemPoints {...base} applied={200} onApply={onApply} />);
    expect(screen.getByText(/Redeeming 200 pts/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("remove"));
    expect(onApply).toHaveBeenCalledWith(0);
  });
});
