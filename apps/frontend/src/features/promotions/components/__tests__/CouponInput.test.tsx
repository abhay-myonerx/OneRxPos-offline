import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

let result: any = { valid: true, name: "SAVE10", discount: "10" };
const validateSpy = vi.fn(() => ({ unwrap: () => Promise.resolve(result) }));

vi.mock("../../api/promotions.api", () => ({
  useValidateCouponMutation: () => [validateSpy, { isLoading: false }],
}));

import { CouponInput } from "../CouponInput";

beforeEach(() => {
  result = { valid: true, name: "SAVE10", discount: "10" };
  vi.clearAllMocks();
});

describe("CouponInput", () => {
  it("applies a valid coupon and reports the code up", async () => {
    const onApplied = vi.fn();
    render(<CouponInput onApplied={onApplied} items={[{ productId: "p1", quantity: 1, unitPrice: 100 }]} />);
    fireEvent.change(screen.getByLabelText("Coupon code"), { target: { value: "SAVE10" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply/i }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith("SAVE10"));
    expect(await screen.findByText(/SAVE10 applied/i)).toBeInTheDocument();
  });

  it("rejects an invalid coupon", async () => {
    result = { valid: false, reason: "Unknown or inactive coupon" };
    const onApplied = vi.fn();
    render(<CouponInput onApplied={onApplied} />);
    fireEvent.change(screen.getByLabelText("Coupon code"), { target: { value: "NOPE" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply/i }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(null));
    expect(await screen.findByText(/Unknown or inactive coupon/i)).toBeInTheDocument();
  });
});
