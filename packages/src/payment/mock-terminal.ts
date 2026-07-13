import type { PaymentTerminal, TxnResult, CardType, EntryMode } from "./payment.types";

function approved(
  cardType: CardType,
  entryMode: EntryMode,
  amountApprovedCents: number,
  seq: number,
): TxnResult {
  return {
    status: "APPROVED",
    cardType,
    entryMode,
    authCode: `A${seq}`,
    referenceNumber: `R${seq}`,
    maskedPan: "1234",
    amountApprovedCents,
  };
}

function nonApproval(status: TxnResult["status"]): TxnResult {
  return {
    status,
    cardType: null,
    entryMode: null,
    authCode: null,
    referenceNumber: null,
    maskedPan: null,
    amountApprovedCents: null,
  };
}

/**
 * Amount-driven mock terminal (HARDWARE_INTEGRATION_SPEC §5.2). Deterministic —
 * no random/date — so tests are reproducible. Drives outcomes by cents amount;
 * everything except the real processor sandbox is exercised here.
 */
export class MockTerminal implements PaymentTerminal {
  private connected = false;
  private seq = 0;
  private last: TxnResult | null = null;
  private lastTxnId: string | null = null;
  private dropNextConnects = 0;

  /** Test hook: make the next N connect() calls fail (network-drop simulation). */
  simulateNetworkDrop(n = 1): void {
    this.dropNextConnects = n;
  }

  async connect(_host: string, _port: number): Promise<void> {
    if (this.dropNextConnects > 0) {
      this.dropNextConnects--;
      throw new Error("terminal connection dropped");
    }
    this.connected = true;
  }

  async purchase(amountCents: number): Promise<TxnResult> {
    this.requireConnected();
    const result = this.scenario(amountCents, ++this.seq);
    this.record(result);
    return result;
  }

  async refund(amountCents: number, _originalTxnId: string): Promise<TxnResult> {
    this.requireConnected();
    const result = approved("INTERAC_DEBIT", null, amountCents, ++this.seq);
    this.record(result);
    return result;
  }

  async void(txnId: string): Promise<TxnResult> {
    this.requireConnected();
    const result = approved(null, null, 0, ++this.seq);
    this.last = result;
    this.lastTxnId = txnId;
    return result;
  }

  async getLastTransaction(): Promise<TxnResult | null> {
    return this.last ? { ...this.last } : null;
  }

  async cancel(): Promise<void> {
    // no-op for the mock
  }

  private requireConnected(): void {
    if (!this.connected) throw new Error("terminal not connected");
  }

  private record(result: TxnResult): void {
    this.last = result;
    this.lastTxnId = `TXN-${this.seq}`;
  }

  private scenario(amountCents: number, seq: number): TxnResult {
    switch (amountCents) {
      case 100:
        return approved("INTERAC_DEBIT", "TAP", 100, seq);
      case 200:
        return approved("VISA", "CHIP", 200, seq);
      case 5:
        return nonApproval("DECLINED"); // insufficient funds
      case 10:
        return nonApproval("DECLINED"); // card expired
      case 25:
        return nonApproval("CANCELLED");
      case 50:
        return nonApproval("TIMEOUT");
      case 1234:
        return {
          status: "PARTIAL",
          cardType: "VISA",
          entryMode: "CHIP",
          authCode: `A${seq}`,
          referenceNumber: `R${seq}`,
          maskedPan: "1234",
          amountApprovedCents: 1000,
        };
      default:
        return approved("INTERAC_DEBIT", "TAP", amountCents, seq);
    }
  }
}
