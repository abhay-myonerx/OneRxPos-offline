// Provider-agnostic payment-terminal seam (Phase 2.10.1). Mock by default; real
// processor adapters (Moneris etc.) register via setTerminal() in 2.10.7,
// selected by config/profile. Card data NEVER passes through — we send an amount
// and receive a non-sensitive TxnResult.

import {
  createTerminal,
  MockTerminal,
  listPaymentProviders,
  type PaymentTerminal,
  type TxnResult,
  type PaymentProviderInfo,
} from "rx-pos-shared";

// Selected processor (from the PAYMENT_PROVIDERS registry). Real acquirer
// adapters are HTTP semi-integrated (Moneris/GlobalPay/…) configured with a
// gateway URL; device-SDK processors (Stripe/Square/Clover) need their SDK.
const ACTIVE_PROCESSOR = process.env.PAYMENT_PROCESSOR ?? "mock";

// Build the active terminal, but NEVER let a misconfigured processor crash the
// server on boot — e.g. a device-SDK processor selected without its SDK makes
// createTerminal throw. Fall back to the mock and log.
function buildTerminal(): PaymentTerminal {
  try {
    return createTerminal({
      processor: ACTIVE_PROCESSOR,
      http: process.env.PAYMENT_TERMINAL_URL
        ? { baseUrl: process.env.PAYMENT_TERMINAL_URL, apiKey: process.env.PAYMENT_TERMINAL_KEY }
        : undefined,
    });
  } catch (err) {
    console.warn(
      `payment-terminal: ${err instanceof Error ? err.message : String(err)} — falling back to mock`,
    );
    return new MockTerminal();
  }
}

let terminal: PaymentTerminal = buildTerminal();

/** Swap the active terminal (a real processor adapter, or a test double). */
export function setTerminal(t: PaymentTerminal): void {
  terminal = t;
}

/** The currently-selected processor id. */
export function getActiveProcessor(): string {
  return ACTIVE_PROCESSOR;
}

/** All supported payment providers (serializable metadata) for the settings UI. */
export function listProviders(): PaymentProviderInfo[] {
  return listPaymentProviders();
}

export async function purchase(amountCents: number): Promise<TxnResult> {
  await terminal.connect("mock", 0);
  return terminal.purchase(amountCents);
}

export async function refund(amountCents: number, originalTxnId: string): Promise<TxnResult> {
  await terminal.connect("mock", 0);
  return terminal.refund(amountCents, originalTxnId);
}

export async function getLastTransaction(): Promise<TxnResult | null> {
  return terminal.getLastTransaction();
}
