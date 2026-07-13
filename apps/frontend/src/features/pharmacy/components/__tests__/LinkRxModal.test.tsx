import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// No learned templates in this test — a typed Rx number stays verbatim.
vi.mock("@/features/pos/barcode/barcode.api", () => ({
  useListBarcodeTemplatesQuery: () => ({ data: [] }),
}));

import { LinkRxModal } from "../LinkRxModal";

const linkButton = () => screen.getByRole("button", { name: "Link Rx", hidden: true });

describe("LinkRxModal", () => {
  it("links the entered Rx number + copay", () => {
    const onLink = vi.fn();
    render(<LinkRxModal open onClose={vi.fn()} onLink={onLink} productName="Amoxil" />);
    fireEvent.change(screen.getByLabelText("Rx number"), { target: { value: "RX-12345" } });
    fireEvent.change(screen.getByLabelText("Copay amount"), { target: { value: "8.40" } });
    fireEvent.click(linkButton());
    expect(onLink).toHaveBeenCalledWith("RX-12345", 8.4);
  });

  it("disables Link until an Rx number is entered", () => {
    const onLink = vi.fn();
    render(<LinkRxModal open onClose={vi.fn()} onLink={onLink} />);
    fireEvent.click(linkButton());
    expect(onLink).not.toHaveBeenCalled();
  });

  it("links with no copay when the amount is blank", () => {
    const onLink = vi.fn();
    render(<LinkRxModal open onClose={vi.fn()} onLink={onLink} />);
    fireEvent.change(screen.getByLabelText("Rx number"), { target: { value: "99" } });
    fireEvent.click(linkButton());
    expect(onLink).toHaveBeenCalledWith("99", undefined);
  });
});
