import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type { Payment, CollectDueInput, ListPaymentsParams } from "../types/payment.types";

export const paymentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listPayments: build.query<
      { data: Payment[]; pagination: PaginatedResponse<Payment>["pagination"] },
      ListPaymentsParams
    >({
      query: (params) => ({ url: "/payments", params }),
      transformResponse: (res: PaginatedResponse<Payment>) => ({
        data: res.data,
        pagination: res.pagination,
      }),
      providesTags: ["Payment"],
    }),
    getPayment: build.query<Payment, string>({
      query: (id) => `/payments/${id}`,
      transformResponse: (res: ApiResponse<Payment>) => res.data,
    }),
    collectDue: build.mutation<Payment, CollectDueInput>({
      query: (body) => ({ url: "/payments/collect-due", method: "POST", body }),
      transformResponse: (res: ApiResponse<Payment>) => res.data,
      invalidatesTags: ["Payment", "Sale", "Customer"],
    }),
    getCustomerPayments: build.query<Payment[], string>({
      query: (customerId) => `/payments/customer/${customerId}`,
      transformResponse: (res: ApiResponse<Payment[]>) => res.data,
    }),
  }),
});

export const {
  useListPaymentsQuery,
  useGetPaymentQuery,
  useCollectDueMutation,
  useGetCustomerPaymentsQuery,
} = paymentsApi;
