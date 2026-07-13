import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";
import type { Tenant, DashboardStats, UpdateTenantInput } from "../types/tenant.types";
import type { TenantSettings } from "@/features/settings/types/settings.types";

export interface ListTenantsParams {
  status?: string;
  page?: number;
  limit?: number;
}

export interface ListTenantsResponse {
  data: Tenant[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface ChangePlanInput {
  plan: string;
}
export interface ChangeStatusInput {
  status: string;
  reason?: string;
}

export interface ManagerDashboardStats {
  todaySales: number;
  todayRevenue: string;
  yesterdayRevenue: string;
  thisMonthRevenue: string;
  lastMonthRevenue: string;
  newCustomersThisMonth: number;
  totalExpensesThisMonth: string;
  stores: number;
  users: number;
  topProducts: Array<{
    productId: string;
    name: string;
    qtySold: number;
    revenue: string;
  }>;
  storePerformance: Array<{
    storeId: string;
    storeName: string;
    saleCount: number;
    revenue: string;
  }>;
}

export const tenantApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMyTenant: build.query<Tenant, void>({
      query: () => "/tenants/me",
      transformResponse: (res: ApiResponse<Tenant>) => res.data,
      providesTags: ["Tenant"],
    }),
    updateMyTenant: build.mutation<Tenant, UpdateTenantInput>({
      query: (body) => ({ url: "/tenants/me", method: "PATCH", body }),
      transformResponse: (res: ApiResponse<Tenant>) => res.data,
      invalidatesTags: ["Tenant"],
    }),
    getDashboard: build.query<DashboardStats, void>({
      query: () => "/tenants/me/dashboard",
      transformResponse: (res: ApiResponse<DashboardStats>) => res.data,
      // The dashboard is the landing page right after onboarding, when the tenant
      // still has zero data. Without a forced refetch, RTK Query keeps serving
      // those first (all-zero) results from cache when the user returns after
      // adding products/sales/customers. Refetch on every mount so the KPI tiles
      // always reflect current data.
      keepUnusedDataFor: 0,
      forceRefetch: () => true,
    }),
    getManagerDashboard: build.query<ManagerDashboardStats, void>({
      query: () => "/tenants/me/manager-dashboard",
      transformResponse: (res: ApiResponse<ManagerDashboardStats>) => res.data,
      keepUnusedDataFor: 0,
      forceRefetch: () => true,
    }),
    getTenantSettings: build.query<TenantSettings, void>({
      query: () => "/tenants/me/settings",
      transformResponse: (res: ApiResponse<TenantSettings>) => res.data,
      providesTags: ["Settings"],
    }),
    updateTenantSettings: build.mutation<TenantSettings, Partial<TenantSettings>>({
      query: (body) => ({ url: "/tenants/me/settings", method: "PATCH", body }),
      transformResponse: (res: ApiResponse<TenantSettings>) => res.data,
      // "Auth" so a sector toggle (enabledSectors.pharmacy) refetches /auth/me
      // and the pharmacy UI gating (useSectorEnabled) flips without a reload.
      invalidatesTags: ["Settings", "Tenant", "Auth"],
    }),

    listAllTenants: build.query<ListTenantsResponse, ListTenantsParams>({
      query: (params) => ({
        url: "/tenants",
        params: { status: params.status, page: params.page ?? 1, limit: params.limit ?? 20 },
      }),
      transformResponse: (res: {
        success: boolean;
        data: Tenant[];
        pagination: ListTenantsResponse["pagination"];
      }) => ({
        data: res.data,
        pagination: res.pagination,
      }),
      providesTags: ["Tenant"],
    }),
    getTenantById: build.query<Tenant, string>({
      query: (id) => `/tenants/${id}`,
      transformResponse: (res: ApiResponse<Tenant>) => res.data,
      providesTags: ["Tenant"],
    }),
    changeTenantPlan: build.mutation<Tenant, { id: string } & ChangePlanInput>({
      query: ({ id, ...body }) => ({ url: `/tenants/${id}/plan`, method: "PATCH", body }),
      transformResponse: (res: ApiResponse<Tenant>) => res.data,
      invalidatesTags: ["Tenant"],
    }),
    changeTenantStatus: build.mutation<Tenant, { id: string } & ChangeStatusInput>({
      query: ({ id, ...body }) => ({ url: `/tenants/${id}/status`, method: "PATCH", body }),
      transformResponse: (res: ApiResponse<Tenant>) => res.data,
      invalidatesTags: ["Tenant"],
    }),
  }),
});

export const {
  useGetMyTenantQuery,
  useUpdateMyTenantMutation,
  useGetDashboardQuery,
  useGetManagerDashboardQuery,
  useGetTenantSettingsQuery,
  useUpdateTenantSettingsMutation,
  // Super Admin
  useListAllTenantsQuery,
  useGetTenantByIdQuery,
  useChangeTenantPlanMutation,
  useChangeTenantStatusMutation,
} = tenantApi;
