import { describe, it, expect } from "vitest";
import { mergeRecallList } from "../recall-merge";
import type { ParkedSaleRecord, ParkedSnapshot } from "../../types/parked-sale.types";

const snap: ParkedSnapshot = {
  items: [], customerId: null, storeId: "s1", shiftId: null, notes: "",
  storeProvince: "ON", cartDiscount: 0, cartDiscountMode: "flat", discountReauth: null,
};

const rec = (id: string, parkedAt: string, origin: "local" | "remote"): ParkedSaleRecord => ({
  id, storeId: "s1", customerId: null, label: null, parkedByUserId: "u1", parkedByName: "A",
  parkedAt, itemCount: 1, total: 10, snapshot: snap, origin,
});

describe("mergeRecallList", () => {
  it("unions local and remote, newest first", () => {
    const merged = mergeRecallList(
      [rec("a", "2026-07-06T10:00:00Z", "local")],
      [rec("b", "2026-07-06T11:00:00Z", "remote")],
    );
    expect(merged.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("dedupes by id and lets the remote copy win (marks it remote-backed)", () => {
    const merged = mergeRecallList(
      [rec("a", "2026-07-06T10:00:00Z", "local")],
      [rec("a", "2026-07-06T10:00:00Z", "remote")],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].origin).toBe("remote");
  });

  it("keeps a local-only hold flagged local (resumable without a claim)", () => {
    const merged = mergeRecallList([rec("a", "2026-07-06T10:00:00Z", "local")], []);
    expect(merged[0].origin).toBe("local");
  });
});
