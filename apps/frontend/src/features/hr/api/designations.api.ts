// RTK Query slice for `/api/v2/hr/designations`.

import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type {
  Designation,
  DesignationListParams,
  CreateDesignationInput,
  UpdateDesignationInput,
} from "../types/hr.types";

import { HR_V2_ROOT } from "./hr-base-url";

const url = (path = "") => `${HR_V2_ROOT}/designations${path}`;

export const designationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listDesignations: build.query<PaginatedResponse<Designation>, DesignationListParams | void>({
      query: (params) => ({ url: url(), params: params ?? undefined }),
      providesTags: (res) =>
        res
          ? [
              { type: "HrDesignation" as const, id: "LIST" },
              ...res.data.map((d) => ({
                type: "HrDesignation" as const,
                id: d.id,
              })),
            ]
          : [{ type: "HrDesignation", id: "LIST" }],
    }),
    getDesignation: build.query<Designation, string>({
      query: (id) => url(`/${id}`),
      transformResponse: (res: ApiResponse<Designation>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "HrDesignation", id }],
    }),
    createDesignation: build.mutation<Designation, CreateDesignationInput>({
      query: (body) => ({ url: url(), method: "POST", body }),
      transformResponse: (res: ApiResponse<Designation>) => res.data,
      invalidatesTags: [{ type: "HrDesignation", id: "LIST" }, "HrEmployee"],
    }),
    updateDesignation: build.mutation<Designation, { id: string; data: UpdateDesignationInput }>({
      query: ({ id, data }) => ({
        url: url(`/${id}`),
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<Designation>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "HrDesignation", id: arg.id },
        { type: "HrDesignation", id: "LIST" },
      ],
    }),
    deactivateDesignation: build.mutation<Designation, string>({
      query: (id) => ({ url: url(`/${id}`), method: "DELETE" }),
      transformResponse: (res: ApiResponse<Designation>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "HrDesignation", id },
        { type: "HrDesignation", id: "LIST" },
      ],
    }),
    restoreDesignation: build.mutation<Designation, string>({
      query: (id) => ({ url: url(`/${id}/restore`), method: "PATCH" }),
      transformResponse: (res: ApiResponse<Designation>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "HrDesignation", id },
        { type: "HrDesignation", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListDesignationsQuery,
  useGetDesignationQuery,
  useCreateDesignationMutation,
  useUpdateDesignationMutation,
  useDeactivateDesignationMutation,
  useRestoreDesignationMutation,
} = designationsApi;
