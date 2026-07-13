import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";

/**
 * Semi-integrated payment terminal (Phase 2.10). We send an amount and receive a
 * non-sensitive result — card data / PIN / EMV never touch the app. Backed by
 * `/api/v1/payment-terminal` (mock in dev; a real processor adapter in prod).
 */
export interface TerminalTxnResult {
  status: "APPROVED" | "DECLINED" | "CANCELLED" | "TIMEOUT" | "PARTIAL" | "ERROR";
  cardType: string | null;
  entryMode: string | null;
  authCode: string | null;
  referenceNumber: string | null;
  maskedPan: string | null; // last 4 only — never a full PAN
  amountApprovedCents: number | null;
}

export interface PaymentProviderInfo {
  id: string;
  label: string;
  regions: string[];
  integration: "mock" | "http-semi-integrated" | "device-sdk";
  readiness: "ready" | "configurable" | "sdk-required";
  connectionModels: string[];
  notes?: string;
}

export interface PaymentProvidersResponse {
  active: string;
  providers: PaymentProviderInfo[];
}

export const paymentTerminalApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    terminalPurchase: build.mutation<TerminalTxnResult, { amountCents: number }>({
      query: (body) => ({ url: "/payment-terminal/purchase", method: "POST", body }),
      transformResponse: (res: ApiResponse<TerminalTxnResult>) => res.data,
    }),
    getPaymentProviders: build.query<PaymentProvidersResponse, void>({
      query: () => "/payment-terminal/providers",
      transformResponse: (res: ApiResponse<PaymentProvidersResponse>) => res.data,
    }),
  }),
});

export const { useTerminalPurchaseMutation, useGetPaymentProvidersQuery } = paymentTerminalApi;
