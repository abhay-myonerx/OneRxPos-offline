import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScanPreviewModal } from "../ScanPreviewModal";
import type { ScanPreview } from "@/features/pos/hooks/useRingUp";

// The shared Modal keeps its footer aria-hidden until a double-rAF flips it
// visible; query the action button with { hidden: true }.
const addButton = () => screen.getByRole("button", { name: "Add to cart", hidden: true });

describe("ScanPreviewModal", () => {
  it("renders nothing when there is no preview", () => {
    const { container } = render(
      <ScanPreviewModal preview={null} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows Rx number, patient and price for an Rx scan and confirms", () => {
    const preview: ScanPreview = {
      kind: "rx",
      title: "Rx #12345",
      rxNumber: "12345",
      patient: "Jane Doe",
      price: 12.4,
      taxCategory: "ZERO_RATED",
    };
    const onConfirm = vi.fn();
    render(<ScanPreviewModal preview={preview} onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(screen.getByText("12345")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    fireEvent.click(addButton());
    expect(onConfirm).toHaveBeenCalled();
  });

  it("shows weight + price for a GS1 weighed scan", () => {
    const preview: ScanPreview = { kind: "gs1", title: "Deli Cheese", price: 6.2, weightKg: 0.62 };
    render(<ScanPreviewModal preview={preview} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Deli Cheese")).toBeInTheDocument();
    expect(screen.getByText("0.62 kg")).toBeInTheDocument();
  });
});
