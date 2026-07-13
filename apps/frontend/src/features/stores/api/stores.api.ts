import { baseApi } from "@/store/base-api";
import { env } from "@/shell/env";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type {
  Store,
  StoreStats,
  CreateStoreInput,
  UpdateStoreGeolocationInput,
  UpdateStoreInput,
  UpdateStoreIpWhitelistInput,
} from "../types/store.types";

const v1 = env.apiUrl;
const STORES_V2_ROOT = v1.replace(/\/api\/v\d+\/?$/, "/api") + "/v2/stores";

export const storesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listStores: build.query<
      PaginatedResponse<Store>["data"],
      { search?: string; isActive?: boolean; page?: number; limit?: number }
    >({
      query: (params) => ({ url: "/stores", params }),
      transformResponse: (res: PaginatedResponse<Store>) => res.data,
      providesTags: ["Store"],
    }),
    getStore: build.query<Store, string>({
      query: (id) => `/stores/${id}`,
      transformResponse: (res: ApiResponse<Store>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "Store", id }],
    }),
    createStore: build.mutation<Store, CreateStoreInput>({
      query: (body) => ({ url: "/stores", method: "POST", body }),
      transformResponse: (res: ApiResponse<Store>) => res.data,
      invalidatesTags: ["Store"],
    }),
    updateStore: build.mutation<Store, { id: string; data: UpdateStoreInput }>({
      query: ({ id, data }) => ({ url: `/stores/${id}`, method: "PATCH", body: data }),
      transformResponse: (res: ApiResponse<Store>) => res.data,
      invalidatesTags: ["Store"],
    }),
    deleteStore: build.mutation<void, string>({
      query: (id) => ({ url: `/stores/${id}`, method: "DELETE" }),
      invalidatesTags: ["Store"],
    }),
    getStoreStats: build.query<StoreStats, string>({
      query: (id) => `/stores/${id}/stats`,
      transformResponse: (res: ApiResponse<StoreStats>) => res.data,
    }),

    updateStoreGeolocation: build.mutation<
      Store,
      { id: string; data: UpdateStoreGeolocationInput }
    >({
      query: ({ id, data }) => ({
        url: `${STORES_V2_ROOT}/${id}/geolocation`,
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<Store>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "Store", id: arg.id },
        { type: "Store", id: "LIST" },
      ],
    }),
    // PATCH /api/v2/stores/:id/ip-whitelist
    updateStoreIpWhitelist: build.mutation<
      Store,
      { id: string; data: UpdateStoreIpWhitelistInput }
    >({
      query: ({ id, data }) => ({
        url: `${STORES_V2_ROOT}/${id}/ip-whitelist`,
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<Store>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "Store", id: arg.id },
        { type: "Store", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListStoresQuery,
  useGetStoreQuery,
  useCreateStoreMutation,
  useUpdateStoreMutation,
  useDeleteStoreMutation,
  useGetStoreStatsQuery,
  useUpdateStoreGeolocationMutation,
  useUpdateStoreIpWhitelistMutation,
} = storesApi;
