import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaxRulesViewer } from "../components/TaxRulesViewer";

// Fixed "as of" date so this test is independent of the current date and of
// any future rate changes (e.g. NS's 2025-04-01 HST cut). All provinces below
// have a single stable profile effective well before this date.
const AS_OF = new Date("2026-07-05");

describe("TaxRulesViewer", () => {
  it("shows a single combined 13% HST row for Ontario", () => {
    render(<TaxRulesViewer province="ON" at={AS_OF} />);

    const rows = screen.getAllByRole("row");
    const hstRow = rows.find((r) => /HST/.test(r.textContent ?? ""));
    expect(hstRow).toBeDefined();
    expect(hstRow!.textContent).toContain("13%");

    // The federal/provincial split (5% + 8%) should still be visible as detail.
    expect(screen.getByText("5%")).toBeInTheDocument();
    expect(screen.getByText("8%")).toBeInTheDocument();
  });

  it("shows GST 5% and PST 7% as separate rows for British Columbia", () => {
    render(<TaxRulesViewer province="BC" at={AS_OF} />);

    const rows = screen.getAllByRole("row");
    const gstRow = rows.find((r) => /GST/.test(r.textContent ?? ""));
    const pstRow = rows.find((r) => /PST/.test(r.textContent ?? ""));

    expect(gstRow).toBeDefined();
    expect(gstRow!.textContent).toContain("5%");
    expect(pstRow).toBeDefined();
    expect(pstRow!.textContent).toContain("7%");
  });

  it("renders no editing controls — only the province select and a read-only table", () => {
    render(<TaxRulesViewer province="ON" at={AS_OF} />);

    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
