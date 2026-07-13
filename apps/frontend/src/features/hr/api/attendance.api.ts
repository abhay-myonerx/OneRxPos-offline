import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";

import { HR_V2_ROOT } from "./hr-base-url";

import type {
  ApprovalResult,
  AttendanceCorrection,
  AttendanceListParams,
  AttendanceRecord,
  CorrectionCreateInput,
  CorrectionDecisionInput,
  CorrectionListParams,
  PunchInput,
  PunchResult,
  SummaryParams,
  SummaryResult,
  TodayPayload,
} from "../types/attendance.types";

const url = (path = "") => `${HR_V2_ROOT}/attendance${path}`;

export const attendanceApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ── Punch endpoints ────────────────────────────────────────────────
    checkIn: build.mutation<PunchResult, PunchInput>({
      query: (body) => ({ url: url("/check-in"), method: "POST", body }),
      transformResponse: (res: ApiResponse<PunchResult>) => res.data,
      invalidatesTags: [
        { type: "Attendance", id: "TODAY" },
        { type: "Attendance", id: "LIST" },
        { type: "Attendance", id: "SUMMARY" },
      ],
    }),
    checkOut: build.mutation<PunchResult, PunchInput>({
      query: (body) => ({ url: url("/check-out"), method: "POST", body }),
      transformResponse: (res: ApiResponse<PunchResult>) => res.data,
      invalidatesTags: [
        { type: "Attendance", id: "TODAY" },
        { type: "Attendance", id: "LIST" },
        { type: "Attendance", id: "SUMMARY" },
      ],
    }),
    breakStart: build.mutation<PunchResult, PunchInput>({
      query: (body) => ({ url: url("/break-start"), method: "POST", body }),
      transformResponse: (res: ApiResponse<PunchResult>) => res.data,
      invalidatesTags: [
        { type: "Attendance", id: "TODAY" },
        { type: "Attendance", id: "LIST" },
      ],
    }),
    breakEnd: build.mutation<PunchResult, PunchInput>({
      query: (body) => ({ url: url("/break-end"), method: "POST", body }),
      transformResponse: (res: ApiResponse<PunchResult>) => res.data,
      invalidatesTags: [
        { type: "Attendance", id: "TODAY" },
        { type: "Attendance", id: "LIST" },
      ],
    }),

    // ── Reads ──────────────────────────────────────────────────────────
    getToday: build.query<TodayPayload, void>({
      query: () => url("/today"),
      transformResponse: (res: ApiResponse<TodayPayload>) => res.data,
      providesTags: [{ type: "Attendance", id: "TODAY" }],
    }),
    getSummary: build.query<SummaryResult, SummaryParams>({
      query: (params) => ({ url: url("/summary"), params }),
      transformResponse: (res: ApiResponse<SummaryResult>) => res.data,
      providesTags: [{ type: "Attendance", id: "SUMMARY" }],
    }),
    listAttendance: build.query<PaginatedResponse<AttendanceRecord>, AttendanceListParams | void>({
      query: (params) => ({ url: url(), params: params ?? undefined }),
      providesTags: (res) =>
        res
          ? [
              { type: "Attendance" as const, id: "LIST" },
              ...res.data.map((r) => ({
                type: "Attendance" as const,
                id: r.id,
              })),
            ]
          : [{ type: "Attendance", id: "LIST" }],
    }),
    getAttendance: build.query<AttendanceRecord, string>({
      query: (id) => url(`/${id}`),
      transformResponse: (res: ApiResponse<AttendanceRecord>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "Attendance", id }],
    }),

    // ── Corrections ────────────────────────────────────────────────────
    listCorrections: build.query<
      PaginatedResponse<AttendanceCorrection>,
      CorrectionListParams | void
    >({
      query: (params) => ({
        url: url("/corrections"),
        params: params ?? undefined,
      }),
      providesTags: (res) =>
        res
          ? [
              { type: "AttendanceCorrection" as const, id: "LIST" },
              ...res.data.map((c) => ({
                type: "AttendanceCorrection" as const,
                id: c.id,
              })),
            ]
          : [{ type: "AttendanceCorrection", id: "LIST" }],
    }),
    getCorrection: build.query<AttendanceCorrection, string>({
      query: (id) => url(`/corrections/${id}`),
      transformResponse: (res: ApiResponse<AttendanceCorrection>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "AttendanceCorrection", id }],
    }),
    createCorrection: build.mutation<AttendanceCorrection, CorrectionCreateInput>({
      query: (body) => ({
        url: url("/corrections"),
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiResponse<AttendanceCorrection>) => res.data,
      invalidatesTags: [{ type: "AttendanceCorrection", id: "LIST" }],
    }),
    approveCorrection: build.mutation<
      ApprovalResult,
      { id: string; data: CorrectionDecisionInput }
    >({
      query: ({ id, data }) => ({
        url: url(`/corrections/${id}/approve`),
        method: "POST",
        body: data,
      }),
      transformResponse: (res: ApiResponse<ApprovalResult>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "AttendanceCorrection", id: arg.id },
        { type: "AttendanceCorrection", id: "LIST" },
        { type: "Attendance", id: "LIST" },
        { type: "Attendance", id: "TODAY" },
        { type: "Attendance", id: "SUMMARY" },
      ],
    }),
    rejectCorrection: build.mutation<
      AttendanceCorrection,
      { id: string; data: CorrectionDecisionInput }
    >({
      query: ({ id, data }) => ({
        url: url(`/corrections/${id}/reject`),
        method: "POST",
        body: data,
      }),
      transformResponse: (res: ApiResponse<AttendanceCorrection>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "AttendanceCorrection", id: arg.id },
        { type: "AttendanceCorrection", id: "LIST" },
      ],
    }),
    cancelCorrection: build.mutation<AttendanceCorrection, string>({
      query: (id) => ({
        url: url(`/corrections/${id}/cancel`),
        method: "POST",
      }),
      transformResponse: (res: ApiResponse<AttendanceCorrection>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "AttendanceCorrection", id },
        { type: "AttendanceCorrection", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useCheckInMutation,
  useCheckOutMutation,
  useBreakStartMutation,
  useBreakEndMutation,
  useGetTodayQuery,
  useGetSummaryQuery,
  useListAttendanceQuery,
  useGetAttendanceQuery,
  useListCorrectionsQuery,
  useGetCorrectionQuery,
  useCreateCorrectionMutation,
  useApproveCorrectionMutation,
  useRejectCorrectionMutation,
  useCancelCorrectionMutation,
} = attendanceApi;
