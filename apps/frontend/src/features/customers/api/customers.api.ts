import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type {
  Customer,
  CustomerGroup,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerListParams,
  CreateGroupInput,
  UpdateGroupInput,
  AdjustPointsInput,
  AdjustPointsResponse,
  LoyaltyProgram,
  LoyaltyTransaction,
  CustomerLedger,
  CustomerStatementData,
} from "../types/customer.types";

interface RawLoyaltyHistoryResponse {
  success: true;
  customer: { id: string; name: string; loyaltyPoints: number };
  data: LoyaltyTransaction[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
}

export const customersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listCustomers: build.query<
      { data: Customer[]; pagination: PaginatedResponse<Customer>["pagination"] },
      CustomerListParams
    >({
      query: (params) => ({ url: "/customers", params }),
      transformResponse: (res: PaginatedResponse<Customer>) => ({
        data: res.data,
        pagination: res.pagination,
      }),
      providesTags: ["Customer"],
    }),
    getCustomer: build.query<Customer, string>({
      query: (id) => `/customers/${id}`,
      transformResponse: (res: ApiResponse<Customer>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "Customer", id }],
    }),
    createCustomer: build.mutation<Customer, CreateCustomerInput>({
      query: (body) => ({ url: "/customers", method: "POST", body }),
      transformResponse: (res: ApiResponse<Customer>) => res.data,
      invalidatesTags: ["Customer"],
    }),
    updateCustomer: build.mutation<Customer, { id: string; data: UpdateCustomerInput }>({
      query: ({ id, data }) => ({ url: `/customers/${id}`, method: "PATCH", body: data }),
      transformResponse: (res: ApiResponse<Customer>) => res.data,
      invalidatesTags: ["Customer"],
    }),
    deleteCustomer: build.mutation<void, string>({
      query: (id) => ({ url: `/customers/${id}`, method: "DELETE" }),
      invalidatesTags: ["Customer"],
    }),

    listGroups: build.query<CustomerGroup[], void>({
      query: () => "/customers/groups",
      transformResponse: (res: ApiResponse<CustomerGroup[]>) => res.data,
      providesTags: ["Customer"],
    }),
    createGroup: build.mutation<CustomerGroup, CreateGroupInput>({
      query: (body) => ({ url: "/customers/groups", method: "POST", body }),
      transformResponse: (res: ApiResponse<CustomerGroup>) => res.data,
      invalidatesTags: ["Customer"],
    }),
    updateGroup: build.mutation<CustomerGroup, { id: string; data: UpdateGroupInput }>({
      query: ({ id, data }) => ({ url: `/customers/groups/${id}`, method: "PATCH", body: data }),
      transformResponse: (res: ApiResponse<CustomerGroup>) => res.data,
      invalidatesTags: ["Customer"],
    }),
    deleteGroup: build.mutation<void, string>({
      query: (id) => ({ url: `/customers/groups/${id}`, method: "DELETE" }),
      invalidatesTags: ["Customer"],
    }),

    getLoyaltyProgram: build.query<LoyaltyProgram | null, void>({
      query: () => "/customers/loyalty/program",
      transformResponse: (res: ApiResponse<LoyaltyProgram | null>) => res.data,
    }),

    getCustomerLedger: build.query<CustomerLedger, { id: string; page?: number; limit?: number }>({
      query: ({ id, page = 1, limit = 20 }) => ({
        url: `/customers/${id}/ledger`,
        params: { page, limit },
      }),
      transformResponse: (res: ApiResponse<CustomerLedger>) => res.data,
      providesTags: (_r, _e, { id }) => [{ type: "Customer", id }],
    }),

    // 3H.6 statement (aging + open invoices)
    getCustomerStatement: build.query<CustomerStatementData, { id: string; asOf?: string }>({
      query: ({ id, asOf }) => ({ url: `/customers/${id}/statement`, params: asOf ? { asOf } : {} }),
      transformResponse: (res: ApiResponse<CustomerStatementData>) => res.data,
      providesTags: (_r, _e, { id }) => [{ type: "Customer", id }],
    }),
    emailCustomerStatement: build.mutation<{ status: string }, { id: string; to?: string }>({
      query: ({ id, to }) => ({ url: `/customers/${id}/statement/email`, method: "POST", body: to ? { to } : {} }),
      transformResponse: (res: ApiResponse<{ status: string }>) => res.data,
    }),

    getLoyaltyHistory: build.query<
      {
        customer: { id: string; name: string; loyaltyPoints: number };
        data: LoyaltyTransaction[];
        pagination: RawLoyaltyHistoryResponse["pagination"];
      },
      { id: string; page?: number; limit?: number }
    >({
      query: ({ id, page = 1, limit = 20 }) => ({
        url: `/customers/${id}/loyalty`,
        params: { page, limit },
      }),
      // API wraps differently: { success, customer, data, pagination } — no nested .data wrapper
      transformResponse: (res: RawLoyaltyHistoryResponse) => ({
        customer: res.customer,
        data: res.data,
        pagination: res.pagination,
      }),
      providesTags: (_r, _e, { id }) => [{ type: "Customer", id }],
    }),

    adjustPoints: build.mutation<
      AdjustPointsResponse,
      { customerId: string; data: AdjustPointsInput }
    >({
      query: ({ customerId, data }) => ({
        url: `/customers/${customerId}/loyalty/adjust`,
        method: "POST",
        body: data,
      }),
      transformResponse: (res: ApiResponse<AdjustPointsResponse>) => res.data,
      invalidatesTags: ["Customer"],
    }),
  }),
});

export const {
  useListCustomersQuery,
  useGetCustomerQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
  useListGroupsQuery,
  useCreateGroupMutation,
  useUpdateGroupMutation,
  useDeleteGroupMutation,
  useGetLoyaltyProgramQuery,
  useGetCustomerLedgerQuery,
  useGetCustomerStatementQuery,
  useEmailCustomerStatementMutation,
  useGetLoyaltyHistoryQuery,
  useAdjustPointsMutation,
} = customersApi;
