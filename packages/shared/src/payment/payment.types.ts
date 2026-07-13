// Semi-integrated payment terminal contract (Phase 2.10). Card data / PIN / EMV
// NEVER enter our app — we send an amount, receive a non-sensitive result.

export type TxnStatus = "APPROVED" | "DECLINED" | "CANCELLED" | "TIMEOUT" | "PARTIAL" | "ERROR";
export type CardType = "INTERAC_DEBIT" | "VISA" | "MASTERCARD" | "AMEX" | "GIFT" | null;
export type EntryMode = "TAP" | "CHIP" | "SWIPE" | "MANUAL" | null;

export interface TxnResult {
  status: TxnStatus;
  cardType: CardType;
  entryMode: EntryMode;
  authCode: string | null;
  referenceNumber: string | null;
  maskedPan: string | null; // last 4 only — NEVER a full PAN
  amountApprovedCents: number | null;
}

export interface PaymentTerminal {
  connect(host: string, port: number): Promise<void>;
  purchase(amountCents: number): Promise<TxnResult>;
  refund(amountCents: number, originalTxnId: string): Promise<TxnResult>;
  void(txnId: string): Promise<TxnResult>;
  getLastTransaction(): Promise<TxnResult | null>;
  cancel(): Promise<void>;
}
