import type { PaymentTerminal, TxnResult } from "./payment.types";

export interface TerminalHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type TerminalFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<TerminalHttpResponse>;

export interface HttpTerminalConfig {
  baseUrl: string;
  apiKey?: string;
  /** Processor-specific JSON → TxnResult mapping (confirm field names vs the
   *  processor's developer docs). Defaults to a pass-through of our own shape. */
  mapResponse?: (json: unknown) => TxnResult;
  /** Injectable fetch (browser/node-safe, testable). Defaults to global fetch. */
  fetchImpl?: TerminalFetch;
}

function defaultMap(json: unknown): TxnResult {
  const j = (json ?? {}) as Partial<TxnResult>;
  return {
    status: j.status ?? "ERROR",
    cardType: j.cardType ?? null,
    entryMode: j.entryMode ?? null,
    authCode: j.authCode ?? null,
    referenceNumber: j.referenceNumber ?? null,
    maskedPan: j.maskedPan ?? null, // last-4 only
    amountApprovedCents: j.amountApprovedCents ?? null,
  };
}

/**
 * Generic HTTP semi-integrated payment terminal. POSTs an amount/action to a
 * processor's cloud endpoint and maps the JSON result → TxnResult. No card data
 * ever passes through. Concrete processors (Moneris/GlobalPay/Stripe) are this
 * adapter configured with their base URL + response mapping.
 */
export class HttpTerminalAdapter implements PaymentTerminal {
  private last: TxnResult | null = null;

  constructor(private readonly config: HttpTerminalConfig) {}

  private get fetchImpl(): TerminalFetch {
    return (
      this.config.fetchImpl ?? ((globalThis as { fetch?: TerminalFetch }).fetch as TerminalFetch)
    );
  }

  async connect(_host?: string, _port?: number): Promise<void> {
    // Stateless HTTP — no persistent connection to establish.
  }

  purchase(amountCents: number): Promise<TxnResult> {
    return this.call("purchase", { amountCents });
  }

  refund(amountCents: number, originalTxnId: string): Promise<TxnResult> {
    return this.call("refund", { amountCents, originalTxnId });
  }

  void(txnId: string): Promise<TxnResult> {
    return this.call("void", { txnId });
  }

  async getLastTransaction(): Promise<TxnResult | null> {
    return this.last ? { ...this.last } : null;
  }

  async cancel(): Promise<void> {
    await this.call("cancel", {});
  }

  private async call(action: string, body: object): Promise<TxnResult> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.config.apiKey) headers.authorization = `Bearer ${this.config.apiKey}`;
    const res = await this.fetchImpl(`${this.config.baseUrl}/${action}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`payment terminal HTTP ${res.status}`);
    const map = this.config.mapResponse ?? defaultMap;
    const result = map(await res.json());
    this.last = result;
    return result;
  }
}
