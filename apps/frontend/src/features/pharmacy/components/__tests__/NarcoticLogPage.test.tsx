import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NarcoticProductDto, NarcoticLogEntry } from "../../narcotic.api";

const product: NarcoticProductDto = {
  productId: "p1",
  name: "OxyContin 10mg",
  sku: "OXY-10",
  din: "02244528",
  onHand: 40,
};
const logEntry: NarcoticLogEntry = {
  id: "m1",
  kind: "movement",
  productId: "p1",
  type: "SALE",
  quantityChange: -1,
  quantityAfter: 40,
  referenceType: "SALE",
  createdAt: "2026-07-06T10:00:00Z",
  notes: null,
};
const countSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));

vi.mock("../../narcotic.api", () => ({
  useListNarcoticProductsQuery: () => ({ data: [product] }),
  useNarcoticLogQuery: () => ({ data: [logEntry] }),
  useRecordNarcoticCountMutation: () => [countSpy, {}],
  useRecordNarcoticAdjustmentMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), {}],
}));
vi.mock("@/features/stores/api/stores.api", () => ({
  useListStoresQuery: () => ({ data: [{ id: "s1", name: "Main Store" }] }),
}));
vi.mock("@/features/users/api/users.api", () => ({
  useListUsersQuery: () => ({ data: { data: [{ id: "u1", firstName: "Pat", lastName: "Pharm" }] } }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { storeId: "s1", role: "ADMIN" } }),
}));

import { NarcoticLogPage } from "../NarcoticLogPage";

describe("NarcoticLogPage", () => {
  it("lists narcotic products with on-hand and shows the log on select", () => {
    render(<NarcoticLogPage />);
    expect(screen.getByText("OxyContin 10mg")).toBeInTheDocument();
    expect(screen.getByText("DIN 02244528")).toBeInTheDocument();
    fireEvent.click(screen.getByText("OxyContin 10mg"));
    expect(screen.getByText(/Perpetual log — OxyContin 10mg/)).toBeInTheDocument();
    expect(screen.getByText("SALE")).toBeInTheDocument();
  });

  it("records a physical count with the discrepancy", () => {
    render(<NarcoticLogPage />);
    fireEvent.click(screen.getByText("OxyContin 10mg"));
    fireEvent.click(screen.getByRole("button", { name: /Record count/, hidden: true }));
    fireEvent.change(screen.getByLabelText("Counted quantity"), { target: { value: "38" } });
    expect(screen.getByText("Discrepancy: -2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save count", hidden: true }));
    expect(countSpy).toHaveBeenCalledWith({ storeId: "s1", productId: "p1", countedQty: 38, witnessUserId: undefined, notes: undefined });
  });
});
