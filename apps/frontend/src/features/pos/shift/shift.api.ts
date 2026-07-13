import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";
import type { DenominationCounts } from "./helpers/denominations";

/**
 * Cashier-shift (till session) API (Phase 1.4). Backed by
 * `/api/v1/cashier-shifts`. Open a till with a counted float, record paid-in/out,
 * read a live summary, and close with a counted drawer + over/short.
 */

export interface ShiftDto {
  id: string;
  storeId: string;
  userId: string;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  closingCash: number | null;
  expectedCash: number | null;
  difference: number | null;
  openingCounts: DenominationCounts | null;
  closingCounts: DenominationCounts | null;
  notes: string | null;
}

export interface CashMovementDto {
  id: string;
  shiftId: string;
  type: "PAID_IN" | "PAID_OUT";
  amount: number;
  reason: string | null;
  userId: string;
  createdAt: string;
}

export interface ShiftSummaryDto {
  salesCount: number;
  tenderBreakdown: Record<string, number>;
  changeTotal: number;
  paidIn: number;
  paidOut: number;
  netCashFromSales: number;
  expectedCash: number;
}

export const shiftApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    currentShift: build.query<ShiftDto | null, { storeId: string }>({
      query: ({ storeId }) => ({ url: "/cashier-shifts/current", params: { storeId } }),
      transformResponse: (res: ApiResponse<ShiftDto | null>) => res.data,
      providesTags: ["CashierShift"],
    }),
    openShift: build.mutation<ShiftDto, { storeId: string; openingCounts: DenominationCounts }>({
      query: (body) => ({ url: "/cashier-shifts/open", method: "POST", body }),
      transformResponse: (res: ApiResponse<ShiftDto>) => res.data,
      invalidatesTags: ["CashierShift"],
    }),
    recordCashMovement: build.mutation<
      CashMovementDto,
      { id: string; type: "PAID_IN" | "PAID_OUT"; amount: number; reason?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/cashier-shifts/${id}/cash-movement`,
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiResponse<CashMovementDto>) => res.data,
      invalidatesTags: ["CashierShift"],
    }),
    shiftSummary: build.query<ShiftSummaryDto, { id: string }>({
      query: ({ id }) => `/cashier-shifts/${id}/summary`,
      transformResponse: (res: ApiResponse<ShiftSummaryDto>) => res.data,
      providesTags: ["CashierShift"],
    }),
    closeShift: build.mutation<ShiftDto, { id: string; closingCounts: DenominationCounts }>({
      query: ({ id, closingCounts }) => ({
        url: `/cashier-shifts/${id}/close`,
        method: "POST",
        body: { closingCounts },
      }),
      transformResponse: (res: ApiResponse<ShiftDto>) => res.data,
      invalidatesTags: ["CashierShift"],
    }),
  }),
});

export const {
  useCurrentShiftQuery,
  useOpenShiftMutation,
  useRecordCashMovementMutation,
  useLazyShiftSummaryQuery,
  useCloseShiftMutation,
} = shiftApi;
