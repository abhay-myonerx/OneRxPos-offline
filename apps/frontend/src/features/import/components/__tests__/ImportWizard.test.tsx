import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/parse-spreadsheet", () => ({
  parseSpreadsheet: vi.fn(async () => ({
    headers: ["Name", "SKU", "Cost", "Retail"],
    rows: [{ Name: "Aspirin", SKU: "ASP", Cost: "1.50", Retail: "3" }],
  })),
}));

const importSpy = vi.fn();
vi.mock("../../api/import.api", () => ({
  useImportCatalogMutation: () => [importSpy, { isLoading: false }],
}));
vi.mock("@/lib/api/error-handler", () => ({ showApiError: vi.fn(), showSuccess: vi.fn() }));

import { ImportWizard } from "../ImportWizard";

const previewResult = {
  summary: { create: 1, update: 0, skip: 0, error: 0 },
  rows: [{ index: 0, action: "create", messages: [] }],
};

beforeEach(() => {
  importSpy.mockReset();
  importSpy.mockReturnValue({ unwrap: () => Promise.resolve(previewResult) });
});

describe("ImportWizard", () => {
  it("upload → auto-map → preview → commit", async () => {
    render(<ImportWizard />);

    // Upload a file (parseSpreadsheet is mocked).
    const file = new File(["x"], "catalog.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Spreadsheet file"), { target: { files: [file] } });

    // Mapping step: headers auto-mapped; the Name column maps to "name".
    await waitFor(() => expect(screen.getByLabelText("Map Name")).toBeInTheDocument());
    expect((screen.getByLabelText("Map Name") as HTMLSelectElement).value).toBe("name");
    expect((screen.getByLabelText("Map SKU") as HTMLSelectElement).value).toBe("sku");

    // Preview (dry run) → summary shows.
    fireEvent.click(screen.getByRole("button", { name: /Preview/i }));
    await waitFor(() => expect(screen.getByText(/Create 1/)).toBeInTheDocument());
    expect(importSpy).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true, mode: "PRODUCTS" }));
    // Rows were re-keyed to target fields.
    const previewArg = importSpy.mock.calls[0][0];
    expect(previewArg.rows[0]).toMatchObject({ name: "Aspirin", sku: "ASP" });

    // Commit (real).
    importSpy.mockReturnValue({ unwrap: () => Promise.resolve({ ...previewResult, committed: true }) });
    fireEvent.click(screen.getByRole("button", { name: /Commit import/i }));
    await waitFor(() => expect(screen.getByText(/Import complete/)).toBeInTheDocument());
    expect(importSpy).toHaveBeenLastCalledWith(expect.objectContaining({ dryRun: false }));
  });
});
