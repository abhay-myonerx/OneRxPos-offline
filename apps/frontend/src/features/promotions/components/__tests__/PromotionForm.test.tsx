import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PromotionForm } from "../PromotionForm";

vi.mock("@/components/ui/form/form-field", () => ({
  FormField: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("PromotionForm", () => {
  it("shows percent field for PERCENT_OFF and submits the config", () => {
    const onSubmit = vi.fn();
    render(<PromotionForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "10% off" } });
    fireEvent.change(screen.getByLabelText("Percent"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /Save promotion/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "10% off", type: "PERCENT_OFF", config: { percent: 10 } }),
    );
  });

  it("switches to BOGO fields and submits a BOGO config", () => {
    const onSubmit = vi.fn();
    render(<PromotionForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "b2g1" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "BOGO" } });
    fireEvent.change(screen.getByLabelText("Buy product"), { target: { value: "prod-1" } });
    fireEvent.change(screen.getByLabelText("Buy qty"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Get qty"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /Save promotion/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "BOGO",
        config: { buyProductId: "prod-1", buyQty: 2, getQty: 1, getPercent: 100 },
      }),
    );
  });

  it("COUPON shows a code field and includes it", () => {
    const onSubmit = vi.fn();
    render(<PromotionForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "save" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "COUPON" } });
    fireEvent.change(screen.getByLabelText("Coupon code"), { target: { value: "SAVE10" } });
    fireEvent.change(screen.getByLabelText("Coupon value"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /Save promotion/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "COUPON", couponCode: "SAVE10", config: { mode: "percent", value: 10 } }),
    );
  });
});
