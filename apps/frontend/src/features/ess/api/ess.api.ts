import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type { AttendanceCorrection } from "@/features/hr/types/attendance.types";
import type { LeaveRequest, LeaveType, LeaveBalance } from "@/features/hr/types/leave.types";
import type { Payslip } from "@/features/hr/types/payroll.types";
import type { ShiftSwapRequest } from "@/features/hr/types/shift.types";
import type { EmployeeDocument } from "@/features/hr/types/hr.types";

import { ESS_ROOT } from "./ess-base-url";
import type {
  EssAttendanceListParams,
  EssDashboard,
  EssHolidaysParams,
  EssHolidaysResponse,
  EssLeaveApplyInput,
  EssLeaveBalanceParams,
  EssLeaveRequestListParams,
  EssPayslipsListParams,
  EssProfile,
  EssPunchInput,
  EssPunchResult,
  EssRegularizeInput,
  EssShiftsListParams,
  EssSummaryParams,
  EssSwapRequestInput,
  EssSwapRespondInput,
  EssTodayAttendance,
  UpdateEssProfileInput,
  ShiftSchedule,
} from "../types/ess.types";
import type { AttendanceRecord } from "@/features/hr/types/attendance.types";

const url = (path = "") => `${ESS_ROOT}${path}`;

export const essApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ─── Dashboard ───────────────────────────────────────────────────────────
    getEssDashboard: build.query<EssDashboard, void>({
      query: () => url("/dashboard"),
      transformResponse: (res: ApiResponse<EssDashboard>) => res.data,
      providesTags: [
        { type: "EssProfile", id: "ME" },
        { type: "Attendance", id: "ESS_TODAY" },
        { type: "HrShiftSchedule", id: "ESS_UPCOMING" },
        { type: "HrLeaveBalance", id: "ESS_LIST" },
        { type: "HrLeaveRequest", id: "ESS_LIST" },
        { type: "PayrollPayslip", id: "ESS_LIST" },
      ],
    }),

    // ─── Profile ─────────────────────────────────────────────────────────────
    getEssProfile: build.query<EssProfile, void>({
      query: () => url("/profile"),
      transformResponse: (res: ApiResponse<EssProfile>) => res.data,
      providesTags: [{ type: "EssProfile", id: "ME" }],
    }),
    updateEssProfile: build.mutation<EssProfile, UpdateEssProfileInput>({
      query: (body) => ({ url: url("/profile"), method: "PATCH", body }),
      transformResponse: (res: ApiResponse<EssProfile>) => res.data,
      invalidatesTags: [{ type: "EssProfile", id: "ME" }],
    }),

    // ─── Attendance ──────────────────────────────────────────────────────────
    listEssAttendance: build.query<
      PaginatedResponse<AttendanceRecord>,
      EssAttendanceListParams | void
    >({
      query: (params) => ({ url: url("/attendance"), params: params ?? undefined }),
      providesTags: [{ type: "Attendance", id: "ESS_LIST" }],
    }),
    getEssAttendanceToday: build.query<EssTodayAttendance, void>({
      query: () => url("/attendance/today"),
      transformResponse: (res: ApiResponse<EssTodayAttendance>) => res.data,
      providesTags: [{ type: "Attendance", id: "ESS_TODAY" }],
    }),
    getEssAttendanceSummary: build.query<unknown, EssSummaryParams>({
      query: (params) => ({ url: url("/attendance/summary"), params }),
      transformResponse: (res: ApiResponse<unknown>) => res.data,
      providesTags: [{ type: "Attendance", id: "ESS_SUMMARY" }],
    }),
    essCheckIn: build.mutation<EssPunchResult, EssPunchInput>({
      query: (body) => ({
        url: url("/attendance/check-in"),
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiResponse<EssPunchResult>) => res.data,
      invalidatesTags: [
        { type: "Attendance", id: "ESS_TODAY" },
        { type: "Attendance", id: "ESS_LIST" },
      ],
    }),
    essCheckOut: build.mutation<EssPunchResult, EssPunchInput>({
      query: (body) => ({
        url: url("/attendance/check-out"),
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiResponse<EssPunchResult>) => res.data,
      invalidatesTags: [
        { type: "Attendance", id: "ESS_TODAY" },
        { type: "Attendance", id: "ESS_LIST" },
      ],
    }),
    essBreakStart: build.mutation<EssPunchResult, EssPunchInput>({
      query: (body) => ({
        url: url("/attendance/break-start"),
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiResponse<EssPunchResult>) => res.data,
      invalidatesTags: [{ type: "Attendance", id: "ESS_TODAY" }],
    }),
    essBreakEnd: build.mutation<EssPunchResult, EssPunchInput>({
      query: (body) => ({
        url: url("/attendance/break-end"),
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiResponse<EssPunchResult>) => res.data,
      invalidatesTags: [{ type: "Attendance", id: "ESS_TODAY" }],
    }),
    essRegularize: build.mutation<AttendanceCorrection, EssRegularizeInput>({
      query: (body) => ({
        url: url("/attendance/regularize"),
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiResponse<AttendanceCorrection>) => res.data,
      invalidatesTags: [{ type: "AttendanceCorrection", id: "ESS_LIST" }],
    }),

    // ─── Shifts ──────────────────────────────────────────────────────────────
    listEssShifts: build.query<PaginatedResponse<ShiftSchedule>, EssShiftsListParams | void>({
      query: (params) => ({ url: url("/shifts"), params: params ?? undefined }),
      providesTags: [{ type: "HrShiftSchedule", id: "ESS_LIST" }],
    }),
    essRequestSwap: build.mutation<ShiftSwapRequest, EssSwapRequestInput>({
      query: (body) => ({
        url: url("/shifts/swap-request"),
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiResponse<ShiftSwapRequest>) => res.data,
      invalidatesTags: [{ type: "HrShiftSwap", id: "ESS_LIST" }],
    }),
    essRespondSwap: build.mutation<ShiftSwapRequest, { id: string; data: EssSwapRespondInput }>({
      query: ({ id, data }) => ({
        url: url(`/shifts/swap-respond/${id}`),
        method: "POST",
        body: data,
      }),
      transformResponse: (res: ApiResponse<ShiftSwapRequest>) => res.data,
      invalidatesTags: [{ type: "HrShiftSwap", id: "ESS_LIST" }],
    }),

    // ─── Leave ───────────────────────────────────────────────────────────────
    listEssLeaveTypes: build.query<PaginatedResponse<LeaveType>, void>({
      query: () => url("/leave/types"),
      providesTags: [{ type: "HrLeaveType", id: "ESS_LIST" }],
    }),
    listEssLeaveBalances: build.query<
      PaginatedResponse<LeaveBalance>,
      EssLeaveBalanceParams | void
    >({
      query: (params) => ({
        url: url("/leave/balance"),
        params: params ?? undefined,
      }),
      providesTags: [{ type: "HrLeaveBalance", id: "ESS_LIST" }],
    }),
    listEssLeaveRequests: build.query<
      PaginatedResponse<LeaveRequest>,
      EssLeaveRequestListParams | void
    >({
      query: (params) => ({
        url: url("/leave/requests"),
        params: params ?? undefined,
      }),
      providesTags: [{ type: "HrLeaveRequest", id: "ESS_LIST" }],
    }),
    applyEssLeave: build.mutation<LeaveRequest, EssLeaveApplyInput>({
      query: (body) => ({ url: url("/leave/requests"), method: "POST", body }),
      transformResponse: (res: ApiResponse<LeaveRequest>) => res.data,
      invalidatesTags: [
        { type: "HrLeaveRequest", id: "ESS_LIST" },
        { type: "HrLeaveBalance", id: "ESS_LIST" },
      ],
    }),
    cancelEssLeave: build.mutation<LeaveRequest, string>({
      query: (id) => ({
        url: url(`/leave/requests/${id}/cancel`),
        method: "POST",
      }),
      transformResponse: (res: ApiResponse<LeaveRequest>) => res.data,
      invalidatesTags: [
        { type: "HrLeaveRequest", id: "ESS_LIST" },
        { type: "HrLeaveBalance", id: "ESS_LIST" },
      ],
    }),

    // ─── Payslips ────────────────────────────────────────────────────────────
    listEssPayslips: build.query<PaginatedResponse<Payslip>, EssPayslipsListParams | void>({
      query: (params) => ({ url: url("/payslips"), params: params ?? undefined }),
      providesTags: [{ type: "PayrollPayslip", id: "ESS_LIST" }],
    }),
    getEssPayslip: build.query<Payslip, string>({
      query: (id) => url(`/payslips/${id}`),
      transformResponse: (res: ApiResponse<Payslip>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "PayrollPayslip", id }],
    }),

    // ─── Holidays ────────────────────────────────────────────────────────────
    listEssHolidays: build.query<EssHolidaysResponse, EssHolidaysParams>({
      query: (params) => ({ url: url("/holidays"), params }),
      transformResponse: (res: ApiResponse<EssHolidaysResponse>) => res.data,
      providesTags: (_r, _e, arg) => [{ type: "HrHoliday", id: `ESS_${arg.year}` }],
    }),

    // ─── Documents (own, non-confidential) ────────────────────────────────────
    listEssDocuments: build.query<PaginatedResponse<EmployeeDocument>, void>({
      query: () => url("/documents"),
      providesTags: [{ type: "HrEmployee", id: "ESS_DOCUMENTS" }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetEssDashboardQuery,
  useGetEssProfileQuery,
  useUpdateEssProfileMutation,
  useListEssAttendanceQuery,
  useGetEssAttendanceTodayQuery,
  useGetEssAttendanceSummaryQuery,
  useEssCheckInMutation,
  useEssCheckOutMutation,
  useEssBreakStartMutation,
  useEssBreakEndMutation,
  useEssRegularizeMutation,
  useListEssShiftsQuery,
  useEssRequestSwapMutation,
  useEssRespondSwapMutation,
  useListEssLeaveTypesQuery,
  useListEssLeaveBalancesQuery,
  useListEssLeaveRequestsQuery,
  useApplyEssLeaveMutation,
  useCancelEssLeaveMutation,
  useListEssPayslipsQuery,
  useGetEssPayslipQuery,
  useListEssHolidaysQuery,
  useListEssDocumentsQuery,
} = essApi;
