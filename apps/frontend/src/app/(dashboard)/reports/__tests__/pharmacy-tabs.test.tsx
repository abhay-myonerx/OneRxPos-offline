import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Toggle the pharmacy sector per test via a hoisted flag.
const h = vi.hoisted(() => ({ pharmacy: true }));

vi.mock("@/features/pharmacy/useSectorEnabled", () => ({
  usePharmacyEnabled: () => h.pharmacy,
}));
// All report hooks stay in loading so each report body early-returns <Loading/>.
vi.mock("@/features/reports/api/reports.api", () => {
  const loading = () => ({ isLoading: true, data: undefined });
  return {
    useGetSalesReportQuery: loading,
    useGetProfitReportQuery: loading,
    useGetStockReportQuery: loading,
    useGetCashierReportQuery: loading,
    useGetNarcoticReportQuery: loading,
    useGetRxSalesReportQuery: loading,
    useGetScheduleBreakdownQuery: loading,
  };
});
vi.mock("@/store/hooks", () => ({
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ uiPrefs: { resolvedTheme: "light" } }),
}));
vi.mock("recharts", () => {
  const Noop = () => null;
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    BarChart: Noop, Bar: Noop, XAxis: Noop, YAxis: Noop, CartesianGrid: Noop,
    Tooltip: Noop, PieChart: Noop, Pie: Noop, Cell: Noop, Legend: Noop,
  };
});

import ReportsPage from "../page";

describe("Reports page — pharmacy tabs (Phase 2.5)", () => {
  it("shows pharmacy report tabs when the sector is enabled", () => {
    h.pharmacy = true;
    render(<ReportsPage />);
    expect(screen.getByRole("button", { name: /Narcotic/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rx Sales/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Schedules/ })).toBeInTheDocument();
    // Core tabs always present.
    expect(screen.getByRole("button", { name: "Sales" })).toBeInTheDocument();
  });

  it("hides pharmacy report tabs when the sector is disabled", () => {
    h.pharmacy = false;
    render(<ReportsPage />);
    expect(screen.queryByRole("button", { name: /Narcotic/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rx Sales/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Schedules/ })).not.toBeInTheDocument();
  });
});
