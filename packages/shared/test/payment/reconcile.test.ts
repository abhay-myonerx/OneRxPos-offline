import { describe, it, expect } from "vitest";
import { reconcilePendingPayment } from "../../src/payment/reconcile";
import type { TxnResult } from "../../src/payment/payment.types";

const approved: TxnResult = {
  status: "APPROVED",
  cardType: "INTERAC_DEBIT",
  entryMode: "TAP",
  authCode: "A1",
  referenceNumber: "R1",
  maskedPan: "1234",
  amountApprovedCents: 100,
};

describe("reconcilePendingPayment (duplicate guard)", () => {
  it("approved + not yet recorded → complete", () => {
    expect(reconcilePendingPayment(approved, [])).toEqual({ action: "complete", txn: approved });
  });
  it("approved + already recorded → none (no double-charge)", () => {
    expect(reconcilePendingPayment(approved, ["R1"])).toEqual({ action: "none" });
  });
  it("declined → none", () => {
    expect(reconcilePendingPayment({ ...approved, status: "DECLINED" }, [])).toEqual({ action: "none" });
  });
  it("null last txn → none", () => {
    expect(reconcilePendingPayment(null, [])).toEqual({ action: "none" });
  });
  it("partial + not recorded → complete", () => {
    const partial: TxnResult = { ...approved, status: "PARTIAL", amountApprovedCents: 50 };
    expect(reconcilePendingPayment(partial, [])).toEqual({ action: "complete", txn: partial });
  });
});
