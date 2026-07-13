import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type { Sale, SaleListParams, VoidSaleInput, ReturnSaleInput } from "../types/sale.types";
import type { CheckoutInput } from "@/features/pos/types/checkout.types";

export const salesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    checkout: build.mutation<Sale, CheckoutInput>({
      query: (body) => ({ url: "/sales/checkout", method: "POST", body }),
      transformResponse: (res: ApiResponse<Sale>) => res.data,
      // Invalidate 'Product' so the POS grid refetches updated stock numbers
      invalidatesTags: ["Sale", "Inventory", "Customer", "Product"],
    }),
    listSales: build.query<
      { data: Sale[]; pagination: PaginatedResponse<Sale>["pagination"] },
      SaleListParams
    >({
      query: (params) => ({ url: "/sales", params }),
      transformResponse: (res: PaginatedResponse<Sale>) => ({
        data: res.data,
        pagination: res.pagination,
      }),
      providesTags: ["Sale"],
    }),
    getSale: build.query<Sale, string>({
      query: (id) => `/sales/${id}`,
      transformResponse: (res: ApiResponse<Sale>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "Sale", id }],
    }),
    voidSale: build.mutation<Sale, { id: string; data: VoidSaleInput }>({
      query: ({ id, data }) => ({ url: `/sales/${id}/void`, method: "POST", body: data }),
      transformResponse: (res: ApiResponse<Sale>) => res.data,
      invalidatesTags: ["Sale", "Inventory", "Product"],
    }),
    returnSale: build.mutation<Sale, { id: string; data: ReturnSaleInput }>({
      query: ({ id, data }) => ({ url: `/sales/${id}/return`, method: "POST", body: data }),
      transformResponse: (res: ApiResponse<Sale>) => res.data,
      invalidatesTags: ["Sale", "Inventory", "Customer", "Product"],
    }),
  }),
});

export const {
  useCheckoutMutation,
  useListSalesQuery,
  useGetSaleQuery,
  useVoidSaleMutation,
  useReturnSaleMutation,
} = salesApi;
