import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DenominationGrid } from "../DenominationGrid";
import { OpenTillModal } from "../OpenTillModal";
import { CashMovementModal } from "../CashMovementModal";

describe("DenominationGrid", () => {
  it("emits an updated count and shows the running total", () => {
    const onChange = vi.fn();
    render(<DenominationGrid counts={{ "20": 5 }} onChange={onChange} />);
    // 5 × $20 = $100 total shown
    expect(screen.getByText("Total counted").parentElement).toHaveTextContent("$100.00");
    fireEvent.change(screen.getByLabelText("$10 count"), { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith({ "20": 5, "10": 3 });
  });
});

describe("OpenTillModal", () => {
  it("opens the till with the counted float", async () => {
    const onOpenTill = vi.fn().mockResolvedValue(undefined);
    render(<OpenTillModal open onClose={vi.fn()} onOpenTill={onOpenTill} />);
    fireEvent.change(screen.getByLabelText("$50 count"), { target: { value: "4" } });
    // button label carries the live total ($200)
    fireEvent.click(screen.getByRole("button", { name: /Open till/, hidden: true }));
    expect(onOpenTill).toHaveBeenCalledWith({ "50": 4 });
  });
});

describe("CashMovementModal", () => {
  it("records a paid-out amount with a reason", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CashMovementModal open onClose={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "float to safe" } });
    fireEvent.click(screen.getByRole("button", { name: "Record", hidden: true }));
    expect(onSubmit).toHaveBeenCalledWith("PAID_OUT", 50, "float to safe");
  });
});
