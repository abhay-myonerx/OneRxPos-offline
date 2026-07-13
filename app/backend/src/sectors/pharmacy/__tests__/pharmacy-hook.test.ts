// Phase 2.2 — the pharmacy schedule-enforcement rule table (pure) + the hook's
// first-deny-wins aggregation across cart lines.

import { describe, it, expect } from "vitest";

import { evaluateLine, pharmacyModule } from "../index";
import type { CheckoutContext } from "../../core/types";
import { DrugScheduleCategory } from "../../../generated/prisma/enums";

const { NEEDS_RX, NARCOTIC, BEHIND_COUNTER, OPEN } = DrugScheduleCategory;

describe("evaluateLine (pure rule table)", () => {
  // [category, rxLinked, consultAck] -> [allow, code?]
  const cases: Array<[DrugScheduleCategory, boolean, boolean, boolean, string | undefined]> = [
    // NEEDS_RX: needs a linked Rx (consult irrelevant)
    [NEEDS_RX, false, false, false, "RX_REQUIRED"],
    [NEEDS_RX, false, true, false, "RX_REQUIRED"],
    [NEEDS_RX, true, false, true, undefined],
    // NARCOTIC: treated like NEEDS_RX in 2.2 (needs a linked Rx)
    [NARCOTIC, false, false, false, "RX_REQUIRED"],
    [NARCOTIC, true, false, true, undefined],
    // BEHIND_COUNTER: needs a consult ack (Rx irrelevant)
    [BEHIND_COUNTER, false, false, false, "CONSULT_REQUIRED"],
    [BEHIND_COUNTER, true, false, false, "CONSULT_REQUIRED"],
    [BEHIND_COUNTER, false, true, true, undefined],
    // OPEN: always allowed
    [OPEN, false, false, true, undefined],
    [OPEN, true, true, true, undefined],
  ];

  it.each(cases)(
    "%s rxLinked=%s consultAck=%s -> allow=%s code=%s",
    (scheduleCategory, rxLinked, consultAck, allow, code) => {
      const result = evaluateLine({ scheduleCategory, rxLinked, consultAck });
      expect(result.allow).toBe(allow);
      if (code) {
        expect(result.code).toBe(code);
        expect(result.reason).toBeTruthy();
      }
    },
  );
});

describe("pharmacy compliance hook (first deny wins)", () => {
  const hook = pharmacyModule.complianceHooks![0];
  const ctx = (items: CheckoutContext["items"]): CheckoutContext => ({
    tenantId: "t",
    storeId: "s",
    scratch: {},
    items,
  });

  it("allows a cart of all-OPEN lines", async () => {
    const result = await hook.evaluate(
      ctx([
        { productId: "a", quantity: 1, attributes: { scheduleCategory: OPEN, rxLinked: false, consultAck: false } },
        { productId: "b", quantity: 1, attributes: { scheduleCategory: OPEN, rxLinked: false, consultAck: false } },
      ]),
    );
    expect(result.allow).toBe(true);
  });

  it("returns the FIRST offending line's denial", async () => {
    const result = await hook.evaluate(
      ctx([
        { productId: "ok", quantity: 1, attributes: { scheduleCategory: OPEN, rxLinked: false, consultAck: false } },
        { productId: "bc", quantity: 1, attributes: { scheduleCategory: BEHIND_COUNTER, rxLinked: false, consultAck: false } },
        { productId: "rx", quantity: 1, attributes: { scheduleCategory: NEEDS_RX, rxLinked: false, consultAck: false } },
      ]),
    );
    expect(result.allow).toBe(false);
    expect(result.code).toBe("CONSULT_REQUIRED"); // the BEHIND_COUNTER line comes first
  });

  it("allows when the prescription line carries a linked Rx", async () => {
    const result = await hook.evaluate(
      ctx([
        { productId: "rx", quantity: 1, attributes: { scheduleCategory: NEEDS_RX, rxLinked: true, consultAck: false } },
      ]),
    );
    expect(result.allow).toBe(true);
  });

  it("treats a missing/unknown category as OPEN (allow)", async () => {
    const result = await hook.evaluate(
      ctx([{ productId: "x", quantity: 1, attributes: {} }]),
    );
    expect(result.allow).toBe(true);
  });
});
