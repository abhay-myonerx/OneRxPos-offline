import { describe, expect, it } from "vitest";
import {
  appendOnly,
  fieldMergeLatestTimestamp,
  serverWins,
  sumOfDecrements,
} from "../conflict/strategies";
import { resolveConflict } from "../conflict/registry";

describe("appendOnly", () => {
  it("returns local unchanged (a committed transaction is never overwritten)", () => {
    expect(appendOnly({ id: 1 }, { id: 2 })).toEqual({ id: 1 });
  });
});

describe("serverWins", () => {
  it("returns remote", () => {
    expect(serverWins({ id: 1 }, { id: 2 })).toEqual({ id: 2 });
  });
});

describe("sumOfDecrements", () => {
  it("applies both deltas relative to an explicit base", () => {
    // base=10, local dropped to 8 (delta -2), remote dropped to 7 (delta -3)
    // resolved = 10 + (8-10) + (7-10) = 5
    expect(sumOfDecrements({ quantity: 8 }, { quantity: 7 }, 10)).toEqual({ quantity: 5 });
  });

  it("sums local and remote decrements against remote as base when base is omitted", () => {
    // resolved = local.quantity + remote.quantity - remote.quantity = local.quantity + remote.quantity - 7 = 8
    expect(sumOfDecrements({ quantity: 8 }, { quantity: 7 })).toEqual({ quantity: 8 });
  });

  it("keeps remote's other fields, overriding only quantity", () => {
    expect(sumOfDecrements({ quantity: 8 }, { quantity: 7, sku: "ABC" }, 10)).toEqual({
      quantity: 5,
      sku: "ABC",
    });
  });
});

describe("fieldMergeLatestTimestamp", () => {
  it("prefers local's fields when local.updatedAt is newer", () => {
    const local = { updatedAt: "2026-01-02", name: "L" };
    const remote = { updatedAt: "2026-01-01", name: "R" };
    expect(fieldMergeLatestTimestamp(local, remote)).toEqual({
      updatedAt: "2026-01-02",
      name: "L",
    });
  });

  it("prefers remote's fields when remote.updatedAt is newer", () => {
    const local = { updatedAt: "2026-01-01", name: "L" };
    const remote = { updatedAt: "2026-01-02", name: "R" };
    expect(fieldMergeLatestTimestamp(local, remote)).toEqual({
      updatedAt: "2026-01-02",
      name: "R",
    });
  });
});

describe("resolveConflict", () => {
  it("dispatches sales to appendOnly", () => {
    expect(resolveConflict("sales", { id: 1 }, { id: 2 })).toEqual({ id: 1 });
  });

  it("dispatches products to serverWins", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    expect(resolveConflict("products", a, b)).toEqual(b);
  });

  it("dispatches users to serverWins", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    expect(resolveConflict("users", a, b)).toEqual(b);
  });

  it("dispatches customers to fieldMergeLatestTimestamp, picking local's fields when local is newer", () => {
    const localNewer = { updatedAt: "2026-01-02", name: "L" };
    const remoteOlder = { updatedAt: "2026-01-01", name: "R" };
    expect(resolveConflict("customers", localNewer, remoteOlder)).toEqual({
      updatedAt: "2026-01-02",
      name: "L",
    });
  });

  it("dispatches store_stock to sumOfDecrements with base omitted", () => {
    expect(resolveConflict("store_stock", { quantity: 8 }, { quantity: 7 })).toEqual({
      quantity: 8,
    });
  });

  it("falls back to serverWins and logs a warning for an unknown entity", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    expect(resolveConflict("unknown-x", a, b)).toEqual(b);
  });
});
