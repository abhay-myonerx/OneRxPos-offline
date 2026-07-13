import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";

/**
 * Narcotic log API (Phase 2.4). Perpetual controlled-substance count derived
 * from the StockMovement ledger + physical-count reconciliation + loss/theft/
 * destruction events. PII-free.
 */

export type NarcoticEventType = "COUNT" | "LOSS" | "THEFT" | "DESTRUCTION";

export interface NarcoticProductDto {
  productId: string;
  name: string;
  sku: string;
  din: string | null;
  onHand: number;
}

export interface NarcoticLogEntry {
  id: string;
  kind: "movement" | "count";
  productId: string;
  createdAt: string;
  // movement
  type?: string;
  quantityChange?: number;
  quantityAfter?: number;
  referenceType?: string | null;
  // count
  expectedQty?: number;
  countedQty?: number;
  discrepancy?: number;
  notes?: string | null;
}

export interface NarcoticEventDto {
  id: string;
  storeId: string;
  productId: string;
  eventType: NarcoticEventType;
  expectedQty: number;
  countedQty: number | null;
  quantityChange: number | null;
  discrepancy: number | null;
  reason: string | null;
  witnessUserId: string | null;
  notes: string | null;
  createdAt: string;
}

export const narcoticApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listNarcoticProducts: build.query<NarcoticProductDto[], { storeId: string }>({
      query: ({ storeId }) => ({ url: "/narcotic/products", params: { storeId } }),
      transformResponse: (res: ApiResponse<NarcoticProductDto[]>) => res.data,
      providesTags: ["Narcotic"],
    }),
    narcoticLog: build.query<
      NarcoticLogEntry[],
      { storeId: string; productId?: string; from?: string; to?: string }
    >({
      query: (params) => ({ url: "/narcotic/log", params }),
      transformResponse: (res: ApiResponse<NarcoticLogEntry[]>) => res.data,
      providesTags: ["Narcotic"],
    }),
    recordNarcoticCount: build.mutation<
      NarcoticEventDto,
      { storeId: string; productId: string; countedQty: number; witnessUserId?: string; notes?: string }
    >({
      query: (body) => ({ url: "/narcotic/count", method: "POST", body }),
      transformResponse: (res: ApiResponse<NarcoticEventDto>) => res.data,
      invalidatesTags: ["Narcotic"],
    }),
    recordNarcoticAdjustment: build.mutation<
      NarcoticEventDto,
      {
        storeId: string;
        productId: string;
        eventType: "LOSS" | "THEFT" | "DESTRUCTION";
        quantity: number;
        witnessUserId?: string;
        notes?: string;
      }
    >({
      query: (body) => ({ url: "/narcotic/adjustment", method: "POST", body }),
      transformResponse: (res: ApiResponse<NarcoticEventDto>) => res.data,
      invalidatesTags: ["Narcotic", "Inventory"],
    }),
  }),
});

export const {
  useListNarcoticProductsQuery,
  useNarcoticLogQuery,
  useLazyNarcoticLogQuery,
  useRecordNarcoticCountMutation,
  useRecordNarcoticAdjustmentMutation,
} = narcoticApi;
