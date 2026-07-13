import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecallSalesModal } from "../RecallSalesModal";
import type { ParkedSaleRecord, ParkedSnapshot } from "@/features/pos/types/parked-sale.types";

const snap: ParkedSnapshot = {
  items: [], customerId: null, storeId: "s1", shiftId: null, notes: "",
  storeProvince: "ON", cartDiscount: 0, cartDiscountMode: "flat", discountReauth: null,
};

const rec = (id: string, label: string, origin: "local" | "remote" = "local"): ParkedSaleRecord => ({
  id, storeId: "s1", customerId: null, label, parkedByUserId: "u1", parkedByName: "Cara Cashier",
  parkedAt: new Date().toISOString(), itemCount: 3, total: 42.1, snapshot: snap, origin,
});

function setup(records: ParkedSaleRecord[], extra: Partial<React.ComponentProps<typeof RecallSalesModal>> = {}) {
  const onResume = vi.fn();
  const onDiscard = vi.fn();
  render(
    <RecallSalesModal open onClose={vi.fn()} records={records} onResume={onResume} onDiscard={onDiscard} {...extra} />,
  );
  return { onResume, onDiscard };
}

describe("RecallSalesModal", () => {
  it("lists parked holds with label, count and total", () => {
    setup([rec("a", "phone-in Jane")]);
    expect(screen.getByText("phone-in Jane")).toBeInTheDocument();
    expect(screen.getByText("3 items")).toBeInTheDocument();
    expect(screen.getByText("Cara Cashier")).toBeInTheDocument();
  });

  it("shows an empty state when there are no holds", () => {
    setup([]);
    expect(screen.getByText("No parked sales at this store.")).toBeInTheDocument();
  });

  it("resumes on row click", () => {
    const { onResume } = setup([rec("a", "Jane"), rec("b", "Bob")]);
    fireEvent.click(screen.getByText("Bob"));
    expect(onResume).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });

  it("Enter resumes the highlighted (first) hold", () => {
    const { onResume } = setup([rec("a", "Jane"), rec("b", "Bob")]);
    fireEvent.keyDown(screen.getByText("Jane"), { key: "Enter" });
    expect(onResume).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });

  it("number keys quick-pick by position", () => {
    const { onResume } = setup([rec("a", "Jane"), rec("b", "Bob")]);
    fireEvent.keyDown(screen.getByText("Jane"), { key: "2" });
    expect(onResume).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });

  it("discard button calls onDiscard without resuming", () => {
    const { onResume, onDiscard } = setup([rec("a", "Jane")]);
    fireEvent.click(screen.getByLabelText("Discard parked sale"));
    expect(onDiscard).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    expect(onResume).not.toHaveBeenCalled();
  });

  it("warns that resuming will park the current sale when the cart is non-empty", () => {
    setup([rec("a", "Jane")], { activeCartNonEmpty: true });
    expect(screen.getByText("Resuming will park your current sale first.")).toBeInTheDocument();
  });
});
