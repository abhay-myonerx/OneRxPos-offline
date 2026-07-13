import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";
import { HR_V2_ROOT } from "@/features/hr/api/hr-base-url";

import type {
  ActivityReportData,
  ActivityReportQuery,
  AttendanceReportData,
  AttendanceReportQuery,
  DashboardSummaryData,
  DashboardSummaryQuery,
  EmployeeReportData,
  EmployeeReportQuery,
  LeaveReportData,
  LeaveReportQuery,
  PayrollReportData,
  PayrollReportQuery,
} from "../types/hr-reports.types";

const REPORTS_V2_ROOT = HR_V2_ROOT.replace(/\/hr$/, "/reports");
const url = (path = "") => `${REPORTS_V2_ROOT}${path}`;

// Drop undefined values so RTK Query doesn't serialise them as
// "?dateFrom=undefined" — the backend rejects malformed dates.
function clean(input?: object): Record<string, unknown> | undefined {
  if (!input) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export const hrReportsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getDashboardSummary: build.query<DashboardSummaryData, DashboardSummaryQuery | void>({
      query: (params) => ({
        url: url("/dashboard"),
        params: clean(params ?? undefined),
      }),
      transformResponse: (res: ApiResponse<DashboardSummaryData>) => res.data,
    }),
    getEmployeeReport: build.query<EmployeeReportData, EmployeeReportQuery | void>({
      query: (params) => ({
        url: url("/employees"),
        params: clean(params ?? undefined),
      }),
      transformResponse: (res: ApiResponse<EmployeeReportData>) => res.data,
    }),
    getAttendanceReport: build.query<AttendanceReportData, AttendanceReportQuery | void>({
      query: (params) => ({
        url: url("/attendance"),
        params: clean(params ?? undefined),
      }),
      transformResponse: (res: ApiResponse<AttendanceReportData>) => res.data,
    }),
    getLeaveReport: build.query<LeaveReportData, LeaveReportQuery | void>({
      query: (params) => ({
        url: url("/leave"),
        params: clean(params ?? undefined),
      }),
      transformResponse: (res: ApiResponse<LeaveReportData>) => res.data,
    }),
    getPayrollReport: build.query<PayrollReportData, PayrollReportQuery | void>({
      query: (params) => ({
        url: url("/payroll"),
        params: clean(params ?? undefined),
      }),
      transformResponse: (res: ApiResponse<PayrollReportData>) => res.data,
    }),
    getRecentActivity: build.query<ActivityReportData, ActivityReportQuery | void>({
      query: (params) => ({
        url: url("/activity"),
        params: clean(params ?? undefined),
      }),
      transformResponse: (res: ApiResponse<ActivityReportData>) => res.data,
    }),
  }),
});

export const {
  useGetDashboardSummaryQuery,
  useGetEmployeeReportQuery,
  useGetAttendanceReportQuery,
  useGetLeaveReportQuery,
  useGetPayrollReportQuery,
  useGetRecentActivityQuery,
} = hrReportsApi;
