import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type {
  StoreStock,
  StockMovement,
  StockTransfer,
  AdjustStockInput,
  SetStockInput,
  UpdateThresholdInput,
  CreateTransferInput,
  ListStockParams,
  ListMovementsParams,
  ListTransfersParams,
} from "../types/inventory.types";

export const inventoryApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listStock: build.query<
      { data: StoreStock[]; pagination: PaginatedResponse<StoreStock>["pagination"] },
      ListStockParams
    >({
      query: (params) => ({ url: "/inventory/stock", params }),
      transformResponse: (res: PaginatedResponse<StoreStock>) => ({
        data: res.data,
        pagination: res.pagination,
      }),
      providesTags: ["Inventory"],
    }),

    getLowStock: build.query<
      { data: StoreStock[]; pagination: PaginatedResponse<StoreStock>["pagination"] },
      { storeId?: string; page?: number; limit?: number }
    >({
      query: (params) => ({ url: "/inventory/stock/low", params }),
      transformResponse: (res: PaginatedResponse<StoreStock>) => ({
        data: res.data,
        pagination: res.pagination,
      }),
      providesTags: ["Inventory"],
    }),

    adjustStock: build.mutation<void, AdjustStockInput>({
      query: (body) => ({ url: "/inventory/stock/adjust", method: "POST", body }),
      invalidatesTags: ["Inventory"],
    }),

    setStock: build.mutation<void, SetStockInput>({
      query: (body) => ({ url: "/inventory/stock/set", method: "POST", body }),
      invalidatesTags: ["Inventory"],
    }),

    updateThreshold: build.mutation<
      void,
      { storeId: string; productId: string; data: UpdateThresholdInput }
    >({
      query: ({ storeId, productId, data }) => ({
        url: `/inventory/stock/${storeId}/${productId}/threshold`,
        method: "PATCH",
        body: data,
      }),
      invalidatesTags: ["Inventory"],
    }),

    listMovements: build.query<
      { data: StockMovement[]; pagination: PaginatedResponse<StockMovement>["pagination"] },
      ListMovementsParams
    >({
      query: (params) => ({ url: "/inventory/movements", params }),
      transformResponse: (res: PaginatedResponse<StockMovement>) => ({
        data: res.data,
        pagination: res.pagination,
      }),
      providesTags: ["Inventory"],
    }),

    listTransfers: build.query<
      { data: StockTransfer[]; pagination: PaginatedResponse<StockTransfer>["pagination"] },
      ListTransfersParams
    >({
      query: (params) => ({ url: "/inventory/transfers", params }),
      transformResponse: (res: PaginatedResponse<StockTransfer>) => ({
        data: res.data,
        pagination: res.pagination,
      }),
      providesTags: ["Inventory"],
    }),

    getTransfer: build.query<StockTransfer, string>({
      query: (id) => `/inventory/transfers/${id}`,
      transformResponse: (res: ApiResponse<StockTransfer>) => res.data,
      // Tag both the list bucket and the specific id so both get refreshed by mutations.
      providesTags: (_r, _e, id) => ["Inventory", { type: "Inventory", id }],
    }),

    createTransfer: build.mutation<StockTransfer, CreateTransferInput>({
      query: (body) => ({ url: "/inventory/transfers", method: "POST", body }),
      transformResponse: (res: ApiResponse<StockTransfer>) => res.data,
      invalidatesTags: ["Inventory"],
    }),

    // ship/receive/cancel — invalidate BOTH the generic 'Inventory' tag AND
    // the specific transfer-detail id. Without the id-specific invalidation
    // the detail view would keep showing the old status after the action.
    shipTransfer: build.mutation<void, string>({
      query: (id) => ({ url: `/inventory/transfers/${id}/ship`, method: "POST" }),
      invalidatesTags: (_r, _e, id) => ["Inventory", { type: "Inventory", id }],
    }),

    receiveTransfer: build.mutation<void, { id: string; notes?: string | null }>({
      query: ({ id, notes }) => ({
        url: `/inventory/transfers/${id}/receive`,
        method: "POST",
        body: { notes },
      }),
      invalidatesTags: (_r, _e, { id }) => ["Inventory", { type: "Inventory", id }],
    }),

    cancelTransfer: build.mutation<void, string>({
      query: (id) => ({ url: `/inventory/transfers/${id}/cancel`, method: "POST" }),
      invalidatesTags: (_r, _e, id) => ["Inventory", { type: "Inventory", id }],
    }),
  }),
});

export const {
  useListStockQuery,
  useGetLowStockQuery,
  useAdjustStockMutation,
  useSetStockMutation,
  useUpdateThresholdMutation,
  useListMovementsQuery,
  useListTransfersQuery,
  useGetTransferQuery,
  useCreateTransferMutation,
  useShipTransferMutation,
  useReceiveTransferMutation,
  useCancelTransferMutation,
} = inventoryApi;
