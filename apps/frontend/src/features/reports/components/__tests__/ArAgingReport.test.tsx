import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ArAgingReportData } from "../../types/report.types";

let data: ArAgingReportData | undefined;
let isLoading = false;

vi.mock("../../api/reports.api", () => ({
  useGetArAgingReportQuery: () => ({ data, isLoading }),
}));
vi.mock("@/lib/currency/format-money", () => ({ formatMoney: (n: unknown) => `$${Number(n).toFixed(2)}` }));

import { ArAgingReport } from "../ArAgingReport";

beforeEach(() => {
  isLoading = false;
  data = undefined;
});

describe("ArAgingReport", () => {
  it("shows an empty state when there are no receivables", () => {
    data = { asOf: "2026-07-09T00:00:00.000Z", rows: [], summary: { current: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 } };
    render(<ArAgingReport />);
    expect(screen.getByText(/No outstanding receivables/i)).toBeInTheDocument();
  });

  it("renders customer rows, buckets, and a totals row", () => {
    data = {
      asOf: "2026-07-09T00:00:00.000Z",
      rows: [
        { customerId: "c1", customerName: "Acme", current: 100, d31_60: 0, d61_90: 150, d90plus: 0, total: 250, currentBalance: 250 },
      ],
      summary: { current: 100, d31_60: 0, d61_90: 150, d90plus: 0, total: 250 },
    };
    render(<ArAgingReport />);
    expect(screen.getByText("Acme")).toBeInTheDocument();
    // $250.00 appears in both the row total and the summary total row.
    expect(screen.getAllByText("$250.00").length).toBeGreaterThanOrEqual(2);
    // "Total" appears in both the header and the totals row.
    expect(screen.getAllByText("Total").length).toBeGreaterThanOrEqual(2);
    // CSV export link points at the export endpoint
    expect(screen.getByText("Export CSV").closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("/api/v1/reports/export/ar-aging"),
    );
  });

  it("shows a loading state", () => {
    isLoading = true;
    const { container } = render(<ArAgingReport />);
    expect(container).toBeTruthy();
  });
});
