import type { PaymentTerminal } from "./payment.types";
import { MockTerminal } from "./mock-terminal";
import { HttpTerminalAdapter, type HttpTerminalConfig } from "./http-terminal";
import { getPaymentProvider } from "./providers";

export interface TerminalConfig {
  /** Provider id from the PAYMENT_PROVIDERS registry ("mock" | "moneris" | …). */
  processor: string;
  http?: HttpTerminalConfig;
}

/**
 * Build the active PaymentTerminal from config, dispatching through the provider
 * registry:
 *   - "mock" (or an unknown provider with no http config) → MockTerminal.
 *   - a device-SDK provider (Stripe Terminal / Square / Clover) → throws: those
 *     need a native device SDK, not this HTTP seam. Select mock for testing.
 *   - an HTTP semi-integrated acquirer (Moneris / Global Payments / …) with a
 *     gateway URL → the HTTP adapter, using a verified per-processor response
 *     mapping if supplied (config wins, else the provider preset).
 *   - an HTTP acquirer with NO gateway URL yet → MockTerminal, so checkout keeps
 *     working during setup (the operator hasn't entered credentials).
 * Checkout never changes — only this factory's input does.
 */
export function createTerminal(config: TerminalConfig): PaymentTerminal {
  const provider = getPaymentProvider(config.processor);

  if (provider?.integration === "mock") return new MockTerminal();

  if (provider?.integration === "device-sdk") {
    throw new Error(
      `${provider.label} requires its device SDK (${provider.id}); it cannot be driven through the ` +
        `generic HTTP terminal adapter. Use "mock" for testing or a configurable HTTP acquirer.`,
    );
  }

  if (config.http?.baseUrl) {
    return new HttpTerminalAdapter({
      ...config.http,
      mapResponse: config.http.mapResponse ?? provider?.mapResponse,
    });
  }

  // Selected acquirer but no gateway configured yet → safe fallback for setup.
  return new MockTerminal();
}
