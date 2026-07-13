// Registry of payment processors RX POS can drive, behind the one semi-integrated
// PaymentTerminal interface. This makes every major North-American / Canadian
// acquirer a first-class, selectable option — instead of the previous
// mock-vs-generic-HTTP-only factory.
//
// Honesty about readiness (this matters — payments touch real money):
//   - "ready"        : works today with no external setup (the mock, for testing).
//   - "configurable" : driven by the generic HTTP semi-integrated adapter once
//                      you supply the processor's gateway URL + credentials AND
//                      verify the request/response mapping against THAT
//                      processor's developer sandbox. Production still requires
//                      the processor's certification (esp. Interac).
//   - "sdk-required" : the processor's terminals are driven by a proprietary
//                      Bluetooth/cloud DEVICE SDK (not a generic HTTP gateway),
//                      so a native/SDK integration is needed — registered and
//                      selectable, but not runnable via the HTTP adapter yet.
//
// No fabricated per-processor field mappings are shipped: the exact JSON⇄TxnResult
// mapping is confirmed against each processor's sandbox at integration time
// (HttpTerminalConfig.mapResponse), which is why the acquirers are "configurable"
// rather than claimed-certified.

import type { TxnResult } from "./payment.types";

export type ProviderIntegration = "mock" | "http-semi-integrated" | "device-sdk";
export type ProviderReadiness = "ready" | "configurable" | "sdk-required";
export type ProviderConnection = "cloud" | "network" | "serial" | "usb" | "bluetooth";

export interface PaymentProvider {
  /** Stable id used in config + the factory. */
  id: string;
  label: string;
  /** ISO country codes the processor serves, or "global". */
  regions: string[];
  integration: ProviderIntegration;
  readiness: ProviderReadiness;
  connectionModels: ProviderConnection[];
  /**
   * Optional processor-specific JSON→TxnResult mapping preset for the HTTP
   * adapter. Left undefined for acquirers whose field names must be confirmed
   * against their sandbox — the adapter's default pass-through is used until a
   * verified mapping is supplied via config.
   */
  mapResponse?: (json: unknown) => TxnResult;
  /** Integrator notes: where to get the sandbox / what's required to go live. */
  notes?: string;
}

export const PAYMENT_PROVIDERS: PaymentProvider[] = [
  {
    id: "mock",
    label: "Mock terminal (testing)",
    regions: ["global"],
    integration: "mock",
    readiness: "ready",
    connectionModels: ["network"],
    notes: "Amount-driven test outcomes (approve/decline/timeout/partial). No hardware or account needed.",
  },
  {
    id: "moneris",
    label: "Moneris",
    regions: ["CA"],
    integration: "http-semi-integrated",
    readiness: "configurable",
    connectionModels: ["cloud", "network", "serial"],
    notes: "Largest Canadian acquirer. Free Moneris Developer Portal + esqa.moneris.com sandbox + Penny Value Simulator. Interac certification required for production.",
  },
  {
    id: "globalpay",
    label: "Global Payments",
    regions: ["CA", "US"],
    integration: "http-semi-integrated",
    readiness: "configurable",
    connectionModels: ["cloud", "network"],
    notes: "developer.globalpay.com sandbox (UPA / GP-API). Certification required for production.",
  },
  {
    id: "tdmerchant",
    label: "TD Merchant Solutions",
    regions: ["CA"],
    integration: "http-semi-integrated",
    readiness: "configurable",
    connectionModels: ["cloud", "network"],
    notes: "Canadian acquiring, commonly on Global Payments rails. Partner-gated sandbox.",
  },
  {
    id: "chase",
    label: "Chase Payment Solutions (Paymentech)",
    regions: ["CA", "US"],
    integration: "http-semi-integrated",
    readiness: "configurable",
    connectionModels: ["cloud", "network"],
    notes: "Chase/TD Paymentech. Partner-gated; add on demand.",
  },
  {
    id: "elavon",
    label: "Elavon",
    regions: ["CA", "US"],
    integration: "http-semi-integrated",
    readiness: "configurable",
    connectionModels: ["cloud", "network"],
    notes: "US Bancorp. Converge / semi-integrated sandbox.",
  },
  {
    id: "fiserv",
    label: "Fiserv / First Data",
    regions: ["CA", "US"],
    integration: "http-semi-integrated",
    readiness: "configurable",
    connectionModels: ["cloud", "network"],
    notes: "Fiserv (First Data) semi-integrated gateway. Also backs Clover (see the Clover entry for device-SDK).",
  },
  {
    id: "worldpay",
    label: "Worldpay (FIS)",
    regions: ["global"],
    integration: "http-semi-integrated",
    readiness: "configurable",
    connectionModels: ["cloud", "network"],
    notes: "Global acquirer. Developer sandbox available.",
  },
  {
    id: "helcim",
    label: "Helcim",
    regions: ["CA", "US"],
    integration: "http-semi-integrated",
    readiness: "configurable",
    connectionModels: ["cloud"],
    notes: "Canadian, developer-friendly API + Helcim Card Reader.",
  },
  {
    id: "worldline",
    label: "Worldline / Bambora",
    regions: ["CA", "global"],
    integration: "http-semi-integrated",
    readiness: "configurable",
    connectionModels: ["cloud", "network"],
    notes: "Bambora (now Worldline) North America gateway.",
  },
  {
    id: "adyen",
    label: "Adyen",
    regions: ["global"],
    integration: "http-semi-integrated",
    readiness: "configurable",
    connectionModels: ["cloud", "network"],
    notes: "Enterprise global. Terminal API (cloud/local) sandbox.",
  },
  {
    id: "stripe",
    label: "Stripe Terminal",
    regions: ["global"],
    integration: "device-sdk",
    readiness: "sdk-required",
    connectionModels: ["cloud", "bluetooth"],
    notes: "Driven by Stripe Terminal SDK (simulated reader in test mode is the easiest sandbox). Needs the SDK, not a generic HTTP gateway.",
  },
  {
    id: "square",
    label: "Square",
    regions: ["CA", "US"],
    integration: "device-sdk",
    readiness: "sdk-required",
    connectionModels: ["bluetooth"],
    notes: "Square Reader SDK (Mobile Payments SDK). Device-SDK integration required.",
  },
  {
    id: "clover",
    label: "Clover (Fiserv)",
    regions: ["CA", "US"],
    integration: "device-sdk",
    readiness: "sdk-required",
    connectionModels: ["cloud", "bluetooth"],
    notes: "Clover devices via the Clover SDK / semi-integration. Device-SDK integration required.",
  },
];

export function getPaymentProvider(id: string): PaymentProvider | undefined {
  return PAYMENT_PROVIDERS.find((p) => p.id === id);
}

/** Provider metadata safe to serialize (drops the mapResponse function). */
export type PaymentProviderInfo = Omit<PaymentProvider, "mapResponse">;

export function listPaymentProviders(): PaymentProviderInfo[] {
  return PAYMENT_PROVIDERS.map(({ mapResponse: _mapResponse, ...info }) => info);
}
