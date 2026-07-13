import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CustomerStatementData } from "../../types/customer.types";

const emailSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({ status: "QUEUED" }) }));
let data: CustomerStatementData | undefined;

vi.mock("../../api/customers.api", () => ({
  useGetCustomerStatementQuery: () => ({ data, isLoading: false }),
  useEmailCustomerStatementMutation: () => [emailSpy, { isLoading: false }],
}));
vi.mock("@/lib/currency/format-money", () => ({ formatMoney: (n: unknown) => `$${Number(n).toFixed(2)}` }));
vi.mock("@/lib/api/error-handler", () => ({ showApiError: vi.fn(), showSuccess: vi.fn() }));

import { CustomerStatement } from "../CustomerStatement";

const base: CustomerStatementData = {
  customer: { id: "c1", name: "Acme", email: "a@c.co" },
  asOf: "2026-07-09T00:00:00.000Z",
  openInvoices: [
    { saleId: "s1", invoiceNo: "INV-1", date: "2026-05-01T00:00:00.000Z", ageDays: 69, bucket: "d61_90", grandTotal: 200, dueAmount: 150 },
  ],
  recentPayments: [],
  aging: { current: 0, d31_60: 0, d61_90: 150, d90plus: 0, total: 150 },
  currentBalance: 150,
  reconciled: true,
};

beforeEach(() => {
  data = base;
  vi.clearAllMocks();
});

describe("CustomerStatement", () => {
  it("renders aging buckets + open invoices", () => {
    render(<CustomerStatement customerId="c1" />);
    expect(screen.getByText("INV-1")).toBeInTheDocument();
    expect(screen.getByText("69")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("Print opens the print URL", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<CustomerStatement customerId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: /Print/i }));
    expect(openSpy).toHaveBeenCalledWith("/api/v1/customers/c1/statement/print", "_blank");
    openSpy.mockRestore();
  });

  it("Email statement fires the mutation", () => {
    render(<CustomerStatement customerId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: /Email statement/i }));
    expect(emailSpy).toHaveBeenCalledWith({ id: "c1" });
  });

  it("shows a reconciliation warning when not reconciled", () => {
    data = { ...base, reconciled: false };
    render(<CustomerStatement customerId="c1" />);
    expect(screen.getByText(/differs from the account balance/i)).toBeInTheDocument();
  });
});
