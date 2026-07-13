// RTK Query slice for `/api/v2/hr/departments`.

import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type {
  Department,
  DepartmentListParams,
  CreateDepartmentInput,
  UpdateDepartmentInput,
} from "../types/hr.types";

import { HR_V2_ROOT } from "./hr-base-url";

const url = (path = "") => `${HR_V2_ROOT}/departments${path}`;

export const departmentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listDepartments: build.query<PaginatedResponse<Department>, DepartmentListParams | void>({
      query: (params) => ({ url: url(), params: params ?? undefined }),
      providesTags: (res) =>
        res
          ? [
              { type: "HrDepartment" as const, id: "LIST" },
              ...res.data.map((d) => ({
                type: "HrDepartment" as const,
                id: d.id,
              })),
            ]
          : [{ type: "HrDepartment", id: "LIST" }],
    }),
    getDepartment: build.query<Department, string>({
      query: (id) => url(`/${id}`),
      transformResponse: (res: ApiResponse<Department>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "HrDepartment", id }],
    }),
    createDepartment: build.mutation<Department, CreateDepartmentInput>({
      query: (body) => ({ url: url(), method: "POST", body }),
      transformResponse: (res: ApiResponse<Department>) => res.data,
      invalidatesTags: [{ type: "HrDepartment", id: "LIST" }, "HrEmployee"],
    }),
    updateDepartment: build.mutation<Department, { id: string; data: UpdateDepartmentInput }>({
      query: ({ id, data }) => ({
        url: url(`/${id}`),
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<Department>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "HrDepartment", id: arg.id },
        { type: "HrDepartment", id: "LIST" },
      ],
    }),
    deactivateDepartment: build.mutation<Department, string>({
      query: (id) => ({ url: url(`/${id}`), method: "DELETE" }),
      transformResponse: (res: ApiResponse<Department>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "HrDepartment", id },
        { type: "HrDepartment", id: "LIST" },
      ],
    }),
    restoreDepartment: build.mutation<Department, string>({
      query: (id) => ({ url: url(`/${id}/restore`), method: "PATCH" }),
      transformResponse: (res: ApiResponse<Department>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "HrDepartment", id },
        { type: "HrDepartment", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListDepartmentsQuery,
  useGetDepartmentQuery,
  useCreateDepartmentMutation,
  useUpdateDepartmentMutation,
  useDeactivateDepartmentMutation,
  useRestoreDepartmentMutation,
} = departmentsApi;
