import type { TxnResult } from "./payment.types";

export type ReconcileDecision = { action: "complete"; txn: TxnResult } | { action: "none" };

/**
 * Duplicate-transaction guard. On POS recovery, decide whether the terminal's
 * last transaction is an APPROVED/PARTIAL payment that was NOT recorded as a
 * completed sale (POS crashed after terminal approval, before writing the sale).
 * A reference number already in `recordedRefs` means it's accounted for → none.
 */
export function reconcilePendingPayment(
  lastTxn: TxnResult | null,
  recordedRefs: readonly string[],
): ReconcileDecision {
  if (!lastTxn) return { action: "none" };
  if (lastTxn.status !== "APPROVED" && lastTxn.status !== "PARTIAL") return { action: "none" };
  if (lastTxn.referenceNumber && recordedRefs.includes(lastTxn.referenceNumber)) {
    return { action: "none" };
  }
  return { action: "complete", txn: lastTxn };
}
