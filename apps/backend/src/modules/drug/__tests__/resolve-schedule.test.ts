// Phase 2.2 — pure `effectiveSchedule` precedence + the batch resolver's
// override-wins / catalog-fallback / OPEN-default behavior.

import { describe, it, expect, vi } from "vitest";

import { effectiveSchedule, resolveCartSchedules } from "../resolve-schedule";
import { DrugScheduleCategory } from "../../../generated/prisma/enums";

const { NEEDS_RX, NARCOTIC, BEHIND_COUNTER, OPEN } = DrugScheduleCategory;

describe("effectiveSchedule (pure precedence)", () => {
  it("override wins over the catalog category", () => {
    expect(effectiveSchedule(NARCOTIC, NEEDS_RX)).toBe(NARCOTIC);
    expect(effectiveSchedule(OPEN, NEEDS_RX)).toBe(OPEN); // an explicit OPEN override still wins
  });

  it("falls back to the catalog category when there is no override", () => {
    expect(effectiveSchedule(null, NEEDS_RX)).toBe(NEEDS_RX);
    expect(effectiveSchedule(null, BEHIND_COUNTER)).toBe(BEHIND_COUNTER);
  });

  it("defaults to OPEN when neither override nor catalog category is set", () => {
    expect(effectiveSchedule(null, null)).toBe(OPEN);
  });
});

describe("resolveCartSchedules (batch DB helper)", () => {
  it("applies override > catalog > OPEN per line with two batched queries", async () => {
    const db = {
      product: {
        findMany: vi.fn().mockResolvedValue([
          { id: "p-override", scheduleOverride: NARCOTIC },
          { id: "p-catalog", scheduleOverride: null },
          { id: "p-open", scheduleOverride: null },
        ]),
      },
      drugProduct: {
        findMany: vi.fn().mockResolvedValue([
          { din: "00000001", scheduleCategory: NEEDS_RX },
          // 00000002 has no catalog row → falls through to OPEN
        ]),
      },
    };

    const result = await resolveCartSchedules(db as never, [
      { productId: "p-override", din: "00000001" }, // override NARCOTIC beats catalog NEEDS_RX
      { productId: "p-catalog", din: "00000001" }, // no override → catalog NEEDS_RX
      { productId: "p-open", din: "00000002" }, // no override, no catalog → OPEN
    ]);

    expect(result.get("p-override")).toBe(NARCOTIC);
    expect(result.get("p-catalog")).toBe(NEEDS_RX);
    expect(result.get("p-open")).toBe(OPEN);

    // Batched: one products query, one drug-products query (not per line).
    expect(db.product.findMany).toHaveBeenCalledTimes(1);
    expect(db.drugProduct.findMany).toHaveBeenCalledTimes(1);
  });

  it("skips the drug-products query when no line carries a DIN", async () => {
    const db = {
      product: {
        findMany: vi.fn().mockResolvedValue([{ id: "p1", scheduleOverride: null }]),
      },
      drugProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const result = await resolveCartSchedules(db as never, [{ productId: "p1", din: null }]);

    expect(result.get("p1")).toBe(OPEN);
    expect(db.drugProduct.findMany).not.toHaveBeenCalled();
  });
});
