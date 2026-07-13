// RTK Query slice for `/api/v2/hr/employees`. List items are the
// narrower `EmployeeListItem` shape (no detail-only fields); detail
// is the full `Employee`.

import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type {
  Employee,
  EmployeeListItem,
  EmployeeListParams,
  CreateContractInput,
  CreateEmployeeInput,
  EmployeeDocument,
  EmployeeWithUser,
  EmploymentContract,
  LinkUserInput,
  SalaryUpdateInput,
  SensitiveUpdateInput,
  TerminateEmployeeInput,
  TerminationCascadeSummary,
  UpdateEmployeeInput,
  UploadDocumentInput,
} from "../types/hr.types";

import { HR_V2_ROOT } from "./hr-base-url";

const url = (path = "") => `${HR_V2_ROOT}/employees${path}`;

export const employeesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listEmployees: build.query<PaginatedResponse<EmployeeListItem>, EmployeeListParams | void>({
      query: (params) => ({ url: url(), params: params ?? undefined }),
      providesTags: (res) =>
        res
          ? [
              { type: "HrEmployee" as const, id: "LIST" },
              ...res.data.map((e) => ({
                type: "HrEmployee" as const,
                id: e.id,
              })),
            ]
          : [{ type: "HrEmployee", id: "LIST" }],
    }),
    getEmployee: build.query<Employee, string>({
      query: (id) => url(`/${id}`),
      transformResponse: (res: ApiResponse<Employee>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "HrEmployee", id }],
    }),
    // POST /api/v2/hr/employees
    //
    // When `createUser` is in the body the response includes
    // `user: { id, email, role, temporaryPassword? }`. We type the
    // response as `EmployeeWithUser` so the caller can surface the
    // freshly-minted credentials to the operator.
    createEmployee: build.mutation<EmployeeWithUser, CreateEmployeeInput>({
      query: (body) => ({ url: url(), method: "POST", body }),
      transformResponse: (res: ApiResponse<EmployeeWithUser>) => res.data,
      invalidatesTags: [
        { type: "HrEmployee", id: "LIST" },
        // Linked-user creation also affects the Users list.
        { type: "User" as const, id: "LIST" },
      ],
    }),
    updateEmployee: build.mutation<Employee, { id: string; data: UpdateEmployeeInput }>({
      query: ({ id, data }) => ({
        url: url(`/${id}`),
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<Employee>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "HrEmployee", id: arg.id },
        { type: "HrEmployee", id: "LIST" },
      ],
    }),
    deactivateEmployee: build.mutation<Employee, string>({
      query: (id) => ({ url: url(`/${id}`), method: "DELETE" }),
      transformResponse: (res: ApiResponse<Employee>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "HrEmployee", id },
        { type: "HrEmployee", id: "LIST" },
      ],
    }),
    restoreEmployee: build.mutation<Employee, string>({
      query: (id) => ({ url: url(`/${id}/restore`), method: "PATCH" }),
      transformResponse: (res: ApiResponse<Employee>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "HrEmployee", id },
        { type: "HrEmployee", id: "LIST" },
      ],
    }),
    // POST /api/v2/hr/employees/:id/link-user
    //
    // Two modes (exactly one of the two body shapes — see backend
    // `linkUserSchema`):
    //   - `{ userId }`        — link an existing user
    //   - `{ createUser: {} }`— mint a new user + link atomically
    //
    // Returns the updated employee plus the linked-or-minted user
    // (with `temporaryPassword` when the service generated it).
    linkEmployeeUser: build.mutation<EmployeeWithUser, { id: string; data: LinkUserInput }>({
      query: ({ id, data }) => ({
        url: url(`/${id}/link-user`),
        method: "POST",
        body: data,
      }),
      transformResponse: (res: ApiResponse<EmployeeWithUser>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "HrEmployee", id: arg.id },
        { type: "HrEmployee", id: "LIST" },
        { type: "User" as const, id: "LIST" },
      ],
    }),

    updateEmployeeSensitive: build.mutation<Employee, { id: string; data: SensitiveUpdateInput }>({
      query: ({ id, data }) => ({
        url: url(`/${id}/sensitive`),
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<Employee>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "HrEmployee", id: arg.id }],
    }),

    updateEmployeeSalary: build.mutation<unknown, { id: string; data: SalaryUpdateInput }>({
      query: ({ id, data }) => ({
        url: url(`/${id}/salary`),
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<unknown>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "HrEmployee", id: arg.id }],
    }),

    terminateEmployee: build.mutation<
      Employee & { cascadeSummary: TerminationCascadeSummary },
      { id: string; data: TerminateEmployeeInput }
    >({
      query: ({ id, data }) => ({
        url: url(`/${id}/terminate`),
        method: "POST",
        body: data,
      }),
      transformResponse: (
        res: ApiResponse<Employee & { cascadeSummary: TerminationCascadeSummary }>,
      ) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "HrEmployee", id: arg.id },
        { type: "HrEmployee", id: "LIST" },
        // Cascade affects leave + shifts.
        { type: "HrLeaveRequest" as const, id: "LIST" },
        { type: "HrShiftSchedule" as const, id: "LIST" },
        { type: "User" as const, id: "LIST" },
      ],
    }),

    listEmployeeContracts: build.query<
      PaginatedResponse<EmploymentContract>,
      { id: string; page?: number; limit?: number; active?: boolean }
    >({
      query: ({ id, ...params }) => ({
        url: url(`/${id}/contracts`),
        params,
      }),
      providesTags: (_r, _e, arg) => [{ type: "HrEmployee", id: `${arg.id}-contracts` }],
    }),

    createEmployeeContract: build.mutation<
      EmploymentContract,
      { id: string; data: CreateContractInput }
    >({
      query: ({ id, data }) => ({
        url: url(`/${id}/contracts`),
        method: "POST",
        body: data,
      }),
      transformResponse: (res: ApiResponse<EmploymentContract>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "HrEmployee", id: `${arg.id}-contracts` }],
    }),

    listEmployeeDocuments: build.query<
      PaginatedResponse<EmployeeDocument>,
      {
        id: string;
        page?: number;
        limit?: number;
        documentType?: string;
      }
    >({
      query: ({ id, ...params }) => ({
        url: url(`/${id}/documents`),
        params,
      }),
      providesTags: (_r, _e, arg) => [{ type: "HrEmployee", id: `${arg.id}-documents` }],
    }),

    uploadEmployeeDocument: build.mutation<
      EmployeeDocument,
      { id: string; data: UploadDocumentInput }
    >({
      query: ({ id, data }) => ({
        url: url(`/${id}/documents`),
        method: "POST",
        body: data,
      }),
      transformResponse: (res: ApiResponse<EmployeeDocument>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "HrEmployee", id: `${arg.id}-documents` }],
    }),

    deleteEmployeeDocument: build.mutation<EmployeeDocument, { id: string; docId: string }>({
      query: ({ id, docId }) => ({
        url: url(`/${id}/documents/${docId}`),
        method: "DELETE",
      }),
      transformResponse: (res: ApiResponse<EmployeeDocument>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "HrEmployee", id: `${arg.id}-documents` }],
    }),
  }),
});

export const {
  useListEmployeesQuery,
  useGetEmployeeQuery,
  useCreateEmployeeMutation,
  useUpdateEmployeeMutation,
  useDeactivateEmployeeMutation,
  useRestoreEmployeeMutation,
  useLinkEmployeeUserMutation,
  useUpdateEmployeeSensitiveMutation,
  useUpdateEmployeeSalaryMutation,
  useTerminateEmployeeMutation,
  useListEmployeeContractsQuery,
  useCreateEmployeeContractMutation,
  useListEmployeeDocumentsQuery,
  useUploadEmployeeDocumentMutation,
  useDeleteEmployeeDocumentMutation,
} = employeesApi;
