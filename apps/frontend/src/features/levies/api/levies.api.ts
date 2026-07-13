import { baseApi } from "@/store/base-api";
import { env } from "@/shell/env";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type { Levy, CreateLevyInput, UpdateLevyInput, ListLeviesParams } from "../types/levy.types";

// Levies live under the v2 API root (`/api/v2/levies`, Task 9) while
// `baseApi`'s configured baseUrl is the v1 root — same pattern as
// `stores.api.ts`'s `STORES_V2_ROOT`.
const v1 = env.apiUrl;
const LEVIES_V2_ROOT = v1.replace(/\/api\/v\d+\/?$/, "/api") + "/v2/levies";

export const leviesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listLevies: build.query<
      { data: Levy[]; pagination: PaginatedResponse<Levy>["pagination"] },
      ListLeviesParams | void
    >({
      query: (params) => ({ url: LEVIES_V2_ROOT, params: params ?? undefined }),
      transformResponse: (res: PaginatedResponse<Levy>) => ({
        data: res.data,
        pagination: res.pagination,
      }),
      providesTags: ["Levy"],
    }),
    getLevy: build.query<Levy, string>({
      query: (id) => `${LEVIES_V2_ROOT}/${id}`,
      transformResponse: (res: ApiResponse<Levy>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "Levy", id }],
    }),
    createLevy: build.mutation<Levy, CreateLevyInput>({
      query: (body) => ({ url: LEVIES_V2_ROOT, method: "POST", body }),
      transformResponse: (res: ApiResponse<Levy>) => res.data,
      invalidatesTags: ["Levy"],
    }),
    updateLevy: build.mutation<Levy, { id: string; data: UpdateLevyInput }>({
      query: ({ id, data }) => ({ url: `${LEVIES_V2_ROOT}/${id}`, method: "PATCH", body: data }),
      transformResponse: (res: ApiResponse<Levy>) => res.data,
      invalidatesTags: ["Levy"],
    }),
    deleteLevy: build.mutation<void, string>({
      query: (id) => ({ url: `${LEVIES_V2_ROOT}/${id}`, method: "DELETE" }),
      invalidatesTags: ["Levy"],
    }),
  }),
});

export const {
  useListLeviesQuery,
  useGetLevyQuery,
  useCreateLevyMutation,
  useUpdateLevyMutation,
  useDeleteLevyMutation,
} = leviesApi;
