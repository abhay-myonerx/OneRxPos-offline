import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import { HR_V2_ROOT } from "./hr-base-url";
import type {
  SalaryStructure,
  SalaryComponent,
  EmployeeSalary,
  PayrollRun,
  Payslip,
  SalaryAdvance,
  PresetResult,
  SalaryStructureListParams,
  EmployeeSalaryListParams,
  PayrollRunListParams,
  PayslipListParams,
  SalaryAdvanceListParams,
  CreateSalaryStructureInput,
  UpdateSalaryStructureInput,
  CreateSalaryComponentInput,
  UpdateSalaryComponentInput,
  AssignEmployeeSalaryInput,
  CreatePayrollRunInput,
  VoidPayslipInput,
  CreateSalaryAdvanceInput,
} from "../types/payroll.types";

const url = (path = "") => `${HR_V2_ROOT}/payroll${path}`;

export const payrollApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // Salary Structures
    listSalaryStructures: build.query<
      PaginatedResponse<SalaryStructure>,
      SalaryStructureListParams | void
    >({
      query: (params) => ({ url: url("/salary-structures"), params: params ?? undefined }),
      providesTags: (res) =>
        res
          ? [
              { type: "PayrollStructure" as const, id: "LIST" },
              ...res.data.map((s) => ({ type: "PayrollStructure" as const, id: s.id })),
            ]
          : [{ type: "PayrollStructure", id: "LIST" }],
    }),
    getSalaryStructure: build.query<SalaryStructure, string>({
      query: (id) => url(`/salary-structures/${id}`),
      transformResponse: (res: ApiResponse<SalaryStructure>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "PayrollStructure", id }],
    }),
    createSalaryStructure: build.mutation<SalaryStructure, CreateSalaryStructureInput>({
      query: (body) => ({ url: url("/salary-structures"), method: "POST", body }),
      transformResponse: (res: ApiResponse<SalaryStructure>) => res.data,
      invalidatesTags: [{ type: "PayrollStructure", id: "LIST" }],
    }),
    updateSalaryStructure: build.mutation<
      SalaryStructure,
      { id: string; data: UpdateSalaryStructureInput }
    >({
      query: ({ id, data }) => ({
        url: url(`/salary-structures/${id}`),
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<SalaryStructure>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "PayrollStructure", id: arg.id },
        { type: "PayrollStructure", id: "LIST" },
      ],
    }),
    deactivateSalaryStructure: build.mutation<SalaryStructure, string>({
      query: (id) => ({ url: url(`/salary-structures/${id}`), method: "DELETE" }),
      transformResponse: (res: ApiResponse<SalaryStructure>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "PayrollStructure", id },
        { type: "PayrollStructure", id: "LIST" },
      ],
    }),
    applyCountryPreset: build.mutation<PresetResult, { id: string; countryCode: string }>({
      query: ({ id, countryCode }) => ({
        url: url(`/salary-structures/${id}/apply-preset`),
        method: "POST",
        body: { countryCode },
      }),
      transformResponse: (res: ApiResponse<PresetResult>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "PayrollStructure", id: arg.id }],
    }),

    // Salary Components — there is no list endpoint; components arrive nested
    // in the salary-structure detail (getSalaryStructure). Mutations therefore
    // invalidate the parent structure so its components refetch.
    createSalaryComponent: build.mutation<
      SalaryComponent,
      { structureId: string; data: CreateSalaryComponentInput }
    >({
      query: ({ structureId, data }) => ({
        url: url(`/salary-structures/${structureId}/components`),
        method: "POST",
        body: data,
      }),
      transformResponse: (res: ApiResponse<SalaryComponent>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "PayrollStructure", id: arg.structureId }],
    }),
    updateSalaryComponent: build.mutation<
      SalaryComponent,
      { structureId: string; cid: string; data: UpdateSalaryComponentInput }
    >({
      query: ({ structureId, cid, data }) => ({
        url: url(`/salary-structures/${structureId}/components/${cid}`),
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<SalaryComponent>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "PayrollStructure", id: arg.structureId }],
    }),
    deactivateSalaryComponent: build.mutation<
      SalaryComponent,
      { structureId: string; cid: string }
    >({
      query: ({ structureId, cid }) => ({
        url: url(`/salary-structures/${structureId}/components/${cid}`),
        method: "DELETE",
      }),
      transformResponse: (res: ApiResponse<SalaryComponent>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "PayrollStructure", id: arg.structureId }],
    }),

    // Employee Salaries
    listEmployeeSalaries: build.query<
      PaginatedResponse<EmployeeSalary>,
      EmployeeSalaryListParams | void
    >({
      query: (params) => ({ url: url("/employee-salaries"), params: params ?? undefined }),
      providesTags: (res) =>
        res
          ? [
              { type: "PayrollEmployeeSalary" as const, id: "LIST" },
              ...res.data.map((s) => ({ type: "PayrollEmployeeSalary" as const, id: s.id })),
            ]
          : [{ type: "PayrollEmployeeSalary", id: "LIST" }],
    }),
    assignEmployeeSalary: build.mutation<EmployeeSalary, AssignEmployeeSalaryInput>({
      query: (body) => ({ url: url("/employee-salaries"), method: "POST", body }),
      transformResponse: (res: ApiResponse<EmployeeSalary>) => res.data,
      invalidatesTags: [{ type: "PayrollEmployeeSalary", id: "LIST" }],
    }),

    // Payroll Runs
    listPayrollRuns: build.query<PaginatedResponse<PayrollRun>, PayrollRunListParams | void>({
      query: (params) => ({ url: url("/runs"), params: params ?? undefined }),
      providesTags: (res) =>
        res
          ? [
              { type: "PayrollRun" as const, id: "LIST" },
              ...res.data.map((r) => ({ type: "PayrollRun" as const, id: r.id })),
            ]
          : [{ type: "PayrollRun", id: "LIST" }],
    }),
    getPayrollRun: build.query<PayrollRun, string>({
      query: (id) => url(`/runs/${id}`),
      transformResponse: (res: ApiResponse<PayrollRun>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "PayrollRun", id }],
    }),
    createPayrollRun: build.mutation<PayrollRun, CreatePayrollRunInput>({
      query: (body) => ({ url: url("/runs"), method: "POST", body }),
      transformResponse: (res: ApiResponse<PayrollRun>) => res.data,
      invalidatesTags: [{ type: "PayrollRun", id: "LIST" }],
    }),
    processPayrollRun: build.mutation<PayrollRun, string>({
      query: (id) => ({ url: url(`/runs/${id}/process`), method: "POST" }),
      transformResponse: (res: ApiResponse<PayrollRun>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "PayrollRun", id },
        { type: "PayrollRun", id: "LIST" },
        { type: "PayrollPayslip", id: `run-${id}` },
      ],
    }),
    approvePayrollRun: build.mutation<PayrollRun, string>({
      query: (id) => ({ url: url(`/runs/${id}/approve`), method: "POST" }),
      transformResponse: (res: ApiResponse<PayrollRun>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "PayrollRun", id },
        { type: "PayrollRun", id: "LIST" },
        { type: "PayrollPayslip", id: `run-${id}` },
      ],
    }),
    // Backend lifecycle verb is "disburse" (DRAFT→process→REVIEW→approve→APPROVED→disburse→PAID).
    payPayrollRun: build.mutation<PayrollRun, string>({
      query: (id) => ({ url: url(`/runs/${id}/disburse`), method: "POST" }),
      transformResponse: (res: ApiResponse<PayrollRun>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "PayrollRun", id },
        { type: "PayrollRun", id: "LIST" },
        { type: "PayrollPayslip", id: `run-${id}` },
      ],
    }),
    cancelPayrollRun: build.mutation<PayrollRun, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({
        url: url(`/runs/${id}/cancel`),
        method: "POST",
        body: { reason },
      }),
      transformResponse: (res: ApiResponse<PayrollRun>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "PayrollRun", id: arg.id },
        { type: "PayrollRun", id: "LIST" },
      ],
    }),

    // Payslips
    listPayslips: build.query<
      PaginatedResponse<Payslip>,
      { runId: string; params?: PayslipListParams }
    >({
      query: ({ runId, params }) => ({ url: url(`/runs/${runId}/payslips`), params }),
      providesTags: (_r, _e, arg) => [{ type: "PayrollPayslip" as const, id: `run-${arg.runId}` }],
    }),
    getPayslip: build.query<Payslip, { runId: string; pid: string }>({
      query: ({ pid }) => url(`/payslips/${pid}`),
      transformResponse: (res: ApiResponse<Payslip>) => res.data,
      providesTags: (_r, _e, arg) => [{ type: "PayrollPayslip", id: arg.pid }],
    }),
    voidPayslip: build.mutation<Payslip, { runId: string; pid: string; data: VoidPayslipInput }>({
      query: ({ pid, data }) => ({ url: url(`/payslips/${pid}/void`), method: "POST", body: data }),
      transformResponse: (res: ApiResponse<Payslip>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "PayrollPayslip", id: arg.pid },
        { type: "PayrollPayslip", id: `run-${arg.runId}` },
      ],
    }),

    // Salary Advances
    listSalaryAdvances: build.query<
      PaginatedResponse<SalaryAdvance>,
      SalaryAdvanceListParams | void
    >({
      query: (params) => ({ url: url("/advances"), params: params ?? undefined }),
      providesTags: (res) =>
        res
          ? [
              { type: "PayrollAdvance" as const, id: "LIST" },
              ...res.data.map((a) => ({ type: "PayrollAdvance" as const, id: a.id })),
            ]
          : [{ type: "PayrollAdvance", id: "LIST" }],
    }),
    createSalaryAdvance: build.mutation<SalaryAdvance, CreateSalaryAdvanceInput>({
      query: (body) => ({ url: url("/advances"), method: "POST", body }),
      transformResponse: (res: ApiResponse<SalaryAdvance>) => res.data,
      invalidatesTags: [{ type: "PayrollAdvance", id: "LIST" }],
    }),
    approveSalaryAdvance: build.mutation<SalaryAdvance, string>({
      query: (id) => ({ url: url(`/advances/${id}/approve`), method: "POST" }),
      transformResponse: (res: ApiResponse<SalaryAdvance>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "PayrollAdvance", id },
        { type: "PayrollAdvance", id: "LIST" },
      ],
    }),
    rejectSalaryAdvance: build.mutation<SalaryAdvance, string>({
      query: (id) => ({ url: url(`/advances/${id}/reject`), method: "POST" }),
      transformResponse: (res: ApiResponse<SalaryAdvance>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "PayrollAdvance", id },
        { type: "PayrollAdvance", id: "LIST" },
      ],
    }),
    disburseSalaryAdvance: build.mutation<SalaryAdvance, string>({
      query: (id) => ({ url: url(`/advances/${id}/disburse`), method: "POST" }),
      transformResponse: (res: ApiResponse<SalaryAdvance>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "PayrollAdvance", id },
        { type: "PayrollAdvance", id: "LIST" },
      ],
    }),
    cancelSalaryAdvance: build.mutation<SalaryAdvance, string>({
      query: (id) => ({ url: url(`/advances/${id}/cancel`), method: "POST" }),
      transformResponse: (res: ApiResponse<SalaryAdvance>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "PayrollAdvance", id },
        { type: "PayrollAdvance", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListSalaryStructuresQuery,
  useGetSalaryStructureQuery,
  useCreateSalaryStructureMutation,
  useUpdateSalaryStructureMutation,
  useDeactivateSalaryStructureMutation,
  useApplyCountryPresetMutation,
  useCreateSalaryComponentMutation,
  useUpdateSalaryComponentMutation,
  useDeactivateSalaryComponentMutation,
  useListEmployeeSalariesQuery,
  useAssignEmployeeSalaryMutation,
  useListPayrollRunsQuery,
  useGetPayrollRunQuery,
  useCreatePayrollRunMutation,
  useProcessPayrollRunMutation,
  useApprovePayrollRunMutation,
  usePayPayrollRunMutation,
  useCancelPayrollRunMutation,
  useListPayslipsQuery,
  useGetPayslipQuery,
  useVoidPayslipMutation,
  useListSalaryAdvancesQuery,
  useCreateSalaryAdvanceMutation,
  useApproveSalaryAdvanceMutation,
  useRejectSalaryAdvanceMutation,
  useDisburseSalaryAdvanceMutation,
  useCancelSalaryAdvanceMutation,
} = payrollApi;
