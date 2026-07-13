import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BarcodeTemplateDto } from "@/features/pos/barcode/barcode.api";
import { BarcodeLabelsTab } from "../BarcodeLabelsTab";

// ── BarcodeLabelsTab ─────────────────────────────────────────────────────────
// Phase 1.3c "learn a label" admin tool. Mirrors ManualItemModal.test.tsx's
// approach: vi.mock the RTK api module and hand back stub hooks. The real
// `decodeBarcode` pipeline is used unmocked so the live test-panel preview is
// exercised end to end.

const sampleTemplate: BarcodeTemplateDto = {
  id: "tpl-1",
  name: "Rx Pharmacy Label",
  matchType: "prefix",
  matchValue: "RX",
  strategy: "delimited",
  config: {
    delimiter: "|",
    priceDecimals: 2,
    taxCategory: "STANDARD",
    fields: [
      { name: "rx", kind: "rxNumber", index: 0 },
      { name: "patient", kind: "patient", index: 1 },
      { name: "amt", kind: "price", index: 2 },
    ],
  },
  isActive: true,
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};

const mockCreateUnwrap = vi.fn(() => Promise.resolve(sampleTemplate));
const mockUpdateUnwrap = vi.fn(() => Promise.resolve(sampleTemplate));
const mockDeleteUnwrap = vi.fn(() => Promise.resolve(undefined));
const mockCreate = vi.fn(() => ({ unwrap: mockCreateUnwrap }));
const mockUpdate = vi.fn(() => ({ unwrap: mockUpdateUnwrap }));
const mockDelete = vi.fn(() => ({ unwrap: mockDeleteUnwrap }));

const mockUseList = vi.fn<() => { data: BarcodeTemplateDto[]; isLoading: boolean }>(() => ({
  data: [sampleTemplate],
  isLoading: false,
}));

vi.mock("@/features/pos/barcode/barcode.api", () => ({
  useListBarcodeTemplatesQuery: () => mockUseList(),
  useCreateBarcodeTemplateMutation: () => [mockCreate, { isLoading: false }],
  useUpdateBarcodeTemplateMutation: () => [mockUpdate, { isLoading: false }],
  useDeleteBarcodeTemplateMutation: () => [mockDelete, { isLoading: false }],
}));

describe("BarcodeLabelsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseList.mockReturnValue({ data: [sampleTemplate], isLoading: false });
  });

  it("lists existing templates with their name and match summary", () => {
    render(<BarcodeLabelsTab />);
    expect(screen.getByText("Rx Pharmacy Label")).toBeInTheDocument();
    expect(screen.getByText(/starts with "RX"/)).toBeInTheDocument();
  });

  it("opens the editor for an existing template and live-decodes a pasted sample into an Rx# preview", async () => {
    render(<BarcodeLabelsTab />);

    await userEvent.click(screen.getByRole("button", { name: "Edit Rx Pharmacy Label" }));

    // Editor is prefilled from the template config.
    expect(screen.getByLabelText("Template Name")).toHaveValue("Rx Pharmacy Label");

    fireEvent.change(screen.getByLabelText("Sample label"), {
      target: { value: "RX9001|Jane Roe|1299" },
    });

    const preview = await screen.findByTestId("decode-preview");
    // rxNumber carved from index 0, price from index 2 with 2 implied decimals.
    expect(preview).toHaveTextContent("RX9001");
    expect(preview).toHaveTextContent("Jane Roe");
    expect(preview).toHaveTextContent("12.99");
  });

  it("does not decode a sample that fails the template match rule as an Rx result", async () => {
    render(<BarcodeLabelsTab />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Rx Pharmacy Label" }));

    fireEvent.change(screen.getByLabelText("Sample label"), {
      target: { value: "NOPE-does-not-start-with-rx" },
    });

    const preview = await screen.findByTestId("decode-preview");
    // The template's "starts with RX" rule declines this label, so the pipeline
    // falls through to a built-in format rather than emitting this template's
    // Rx fields.
    expect(preview).not.toHaveTextContent("Rx #");
    expect(preview).toHaveTextContent(/not this template/i);
  });

  it("saves a new template via the create mutation", async () => {
    render(<BarcodeLabelsTab />);

    await userEvent.click(screen.getByRole("button", { name: "New Template" }));

    fireEvent.change(screen.getByLabelText("Template Name"), {
      target: { value: "Vendor Label" },
    });
    fireEvent.change(screen.getByLabelText("Match Value"), { target: { value: "VN" } });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Vendor Label",
        matchType: "prefix",
        matchValue: "VN",
        strategy: "delimited",
        isActive: true,
        config: expect.objectContaining({ delimiter: "|", fields: [] }),
      }),
    );
    // Not the update path.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("saves edits to an existing template via the update mutation", async () => {
    render(<BarcodeLabelsTab />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Rx Pharmacy Label" }));

    fireEvent.change(screen.getByLabelText("Template Name"), {
      target: { value: "Rx Pharmacy Label v2" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tpl-1", name: "Rx Pharmacy Label v2" }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
