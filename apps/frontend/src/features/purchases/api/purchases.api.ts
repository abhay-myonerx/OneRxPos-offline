import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type {
  PurchaseOrder,
  CreatePurchaseInput,
  ReceiveGoodsInput,
  AddPurchasePaymentInput,
  ListPurchasesParams,
} from "../types/purchase.types";

export const purchasesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listPurchases: build.query<
      { data: PurchaseOrder[]; pagination: PaginatedResponse<PurchaseOrder>["pagination"] },
      ListPurchasesParams
    >({
      query: (params) => ({ url: "/purchases", params }),
      transformResponse: (res: PaginatedResponse<PurchaseOrder>) => ({
        data: res.data,
        pagination: res.pagination,
      }),
      providesTags: ["Purchase"],
    }),
    getPurchase: build.query<PurchaseOrder, string>({
      query: (id) => `/purchases/${id}`,
      transformResponse: (res: ApiResponse<PurchaseOrder>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "Purchase", id }],
    }),
    createPurchase: build.mutation<PurchaseOrder, CreatePurchaseInput>({
      query: (body) => ({ url: "/purchases", method: "POST", body }),
      transformResponse: (res: ApiResponse<PurchaseOrder>) => res.data,
      invalidatesTags: ["Purchase"],
    }),
    receiveGoods: build.mutation<PurchaseOrder, { id: string; data: ReceiveGoodsInput }>({
      query: ({ id, data }) => ({ url: `/purchases/${id}/receive`, method: "POST", body: data }),
      transformResponse: (res: ApiResponse<PurchaseOrder>) => res.data,
      invalidatesTags: ["Purchase", "Inventory"],
    }),
    addPurchasePayment: build.mutation<void, { id: string; data: AddPurchasePaymentInput }>({
      query: ({ id, data }) => ({ url: `/purchases/${id}/payment`, method: "POST", body: data }),
      invalidatesTags: ["Purchase"],
    }),
    cancelPurchase: build.mutation<void, string>({
      query: (id) => ({ url: `/purchases/${id}/cancel`, method: "POST" }),
      invalidatesTags: ["Purchase"],
    }),
  }),
});

export const {
  useListPurchasesQuery,
  useGetPurchaseQuery,
  useCreatePurchaseMutation,
  useReceiveGoodsMutation,
  useAddPurchasePaymentMutation,
  useCancelPurchaseMutation,
} = purchasesApi;
