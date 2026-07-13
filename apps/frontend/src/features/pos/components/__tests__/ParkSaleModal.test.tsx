import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ParkSaleModal } from "../ParkSaleModal";

// The shared Modal mounts its footer inside an aria-hidden container until a
// double-rAF flips it "visible"; getByRole filters aria-hidden, so query the
// action button with { hidden: true } (fireEvent still dispatches its onClick).
const parkButton = () => screen.getByRole("button", { name: "Park sale", hidden: true });

describe("ParkSaleModal", () => {
  it("parks with the entered label", () => {
    const onPark = vi.fn();
    render(<ParkSaleModal open onClose={vi.fn()} onPark={onPark} />);
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "phone-in Jane" } });
    fireEvent.click(parkButton());
    expect(onPark).toHaveBeenCalledWith("phone-in Jane");
  });

  it("parks with null when the label is blank", () => {
    const onPark = vi.fn();
    render(<ParkSaleModal open onClose={vi.fn()} onPark={onPark} />);
    fireEvent.click(parkButton());
    expect(onPark).toHaveBeenCalledWith(null);
  });

  it("Enter in the label field parks with the entered label", () => {
    const onPark = vi.fn();
    render(<ParkSaleModal open onClose={vi.fn()} onPark={onPark} />);
    const input = screen.getByLabelText("Label");
    fireEvent.change(input, { target: { value: "back at 5pm" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPark).toHaveBeenCalledWith("back at 5pm");
  });
});
