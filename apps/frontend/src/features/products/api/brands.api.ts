import { baseApi } from "@/store/base-api";
import { env } from "@/shell/env";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type {
  Brand,
  BrandListParams,
  CreateBrandInput,
  UpdateBrandInput,
} from "../types/brand.types";

// Backend mounts brand routes at `/api/v2/brands`. The shared `baseApi`
// base URL targets `/api/v1`; compute the absolute v2 root once here so
// the v1 base doesn't leak into brand requests.
const v1Root = env.apiUrl;
const BRANDS_ROOT = v1Root.replace(/\/api\/v\d+\/?$/, "/api") + "/v2/brands";

const url = (path = "") => `${BRANDS_ROOT}${path}`;

export const brandsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listBrands: build.query<PaginatedResponse<Brand>, BrandListParams | void>({
      query: (params) => ({ url: url(), params: params ?? undefined }),
      providesTags: (res) =>
        res
          ? [
              { type: "Brand" as const, id: "LIST" },
              ...res.data.map((b) => ({ type: "Brand" as const, id: b.id })),
            ]
          : [{ type: "Brand", id: "LIST" }],
    }),
    getBrand: build.query<Brand, string>({
      query: (id) => url(`/${id}`),
      transformResponse: (res: ApiResponse<Brand>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "Brand", id }],
    }),
    createBrand: build.mutation<Brand, CreateBrandInput>({
      query: (body) => ({ url: url(), method: "POST", body }),
      transformResponse: (res: ApiResponse<Brand>) => res.data,
      invalidatesTags: [{ type: "Brand", id: "LIST" }],
    }),
    updateBrand: build.mutation<Brand, { id: string; data: UpdateBrandInput }>({
      query: ({ id, data }) => ({
        url: url(`/${id}`),
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<Brand>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "Brand", id: arg.id },
        { type: "Brand", id: "LIST" },
      ],
    }),
    deactivateBrand: build.mutation<Brand, string>({
      query: (id) => ({ url: url(`/${id}`), method: "DELETE" }),
      transformResponse: (res: ApiResponse<Brand>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "Brand", id },
        { type: "Brand", id: "LIST" },
      ],
    }),
    restoreBrand: build.mutation<Brand, string>({
      query: (id) => ({ url: url(`/${id}/restore`), method: "PATCH" }),
      transformResponse: (res: ApiResponse<Brand>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "Brand", id },
        { type: "Brand", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListBrandsQuery,
  useGetBrandQuery,
  useCreateBrandMutation,
  useUpdateBrandMutation,
  useDeactivateBrandMutation,
  useRestoreBrandMutation,
} = brandsApi;
