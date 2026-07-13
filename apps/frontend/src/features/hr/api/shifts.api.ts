import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";

import { HR_V2_ROOT } from "./hr-base-url";

import type {
  ScheduleBulkCreateInput,
  ScheduleBulkCreateResult,
  ScheduleListParams,
  ScheduleUpdateInput,
  ShiftSchedule,
  ShiftSwapRequest,
  SwapApproveInput,
  SwapApproveResult,
  SwapListParams,
  SwapRequestCreateInput,
  SwapRespondInput,
  WorkShift,
  WorkShiftCreateInput,
  WorkShiftListParams,
  WorkShiftUpdateInput,
} from "../types/shift.types";

const url = (path = "") => `${HR_V2_ROOT}/shifts${path}`;

export const shiftsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ── Templates ─────────────────────────────────────────────────────
    listWorkShifts: build.query<PaginatedResponse<WorkShift>, WorkShiftListParams | void>({
      query: (params) => ({
        url: url("/templates"),
        params: params ?? undefined,
      }),
      providesTags: (res) =>
        res
          ? [
              { type: "HrWorkShift" as const, id: "LIST" },
              ...res.data.map((s) => ({
                type: "HrWorkShift" as const,
                id: s.id,
              })),
            ]
          : [{ type: "HrWorkShift", id: "LIST" }],
    }),

    getWorkShift: build.query<WorkShift, string>({
      query: (id) => url(`/templates/${id}`),
      transformResponse: (res: ApiResponse<WorkShift>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "HrWorkShift", id }],
    }),

    createWorkShift: build.mutation<WorkShift, WorkShiftCreateInput>({
      query: (body) => ({ url: url("/templates"), method: "POST", body }),
      transformResponse: (res: ApiResponse<WorkShift>) => res.data,
      invalidatesTags: [{ type: "HrWorkShift", id: "LIST" }],
    }),

    updateWorkShift: build.mutation<WorkShift, { id: string; data: WorkShiftUpdateInput }>({
      query: ({ id, data }) => ({
        url: url(`/templates/${id}`),
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<WorkShift>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "HrWorkShift", id: arg.id },
        { type: "HrWorkShift", id: "LIST" },
      ],
    }),

    deactivateWorkShift: build.mutation<WorkShift, string>({
      query: (id) => ({ url: url(`/templates/${id}`), method: "DELETE" }),
      transformResponse: (res: ApiResponse<WorkShift>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "HrWorkShift", id },
        { type: "HrWorkShift", id: "LIST" },
      ],
    }),

    restoreWorkShift: build.mutation<WorkShift, string>({
      query: (id) => ({
        url: url(`/templates/${id}/restore`),
        method: "POST",
      }),
      transformResponse: (res: ApiResponse<WorkShift>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "HrWorkShift", id },
        { type: "HrWorkShift", id: "LIST" },
      ],
    }),

    // ── Schedules ─────────────────────────────────────────────────────
    listSchedules: build.query<PaginatedResponse<ShiftSchedule>, ScheduleListParams | void>({
      query: (params) => ({
        url: url("/schedule"),
        params: params ?? undefined,
      }),
      providesTags: (res) =>
        res
          ? [
              { type: "HrShiftSchedule" as const, id: "LIST" },
              ...res.data.map((s) => ({
                type: "HrShiftSchedule" as const,
                id: s.id,
              })),
            ]
          : [{ type: "HrShiftSchedule", id: "LIST" }],
    }),

    createBulkSchedule: build.mutation<ScheduleBulkCreateResult, ScheduleBulkCreateInput>({
      query: (body) => ({ url: url("/schedule"), method: "POST", body }),
      transformResponse: (res: ApiResponse<ScheduleBulkCreateResult>) => res.data,
      invalidatesTags: [{ type: "HrShiftSchedule", id: "LIST" }],
    }),

    updateSchedule: build.mutation<ShiftSchedule, { id: string; data: ScheduleUpdateInput }>({
      query: ({ id, data }) => ({
        url: url(`/schedule/${id}`),
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<ShiftSchedule>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "HrShiftSchedule", id: arg.id },
        { type: "HrShiftSchedule", id: "LIST" },
      ],
    }),

    cancelSchedule: build.mutation<ShiftSchedule, string>({
      query: (id) => ({ url: url(`/schedule/${id}`), method: "DELETE" }),
      transformResponse: (res: ApiResponse<ShiftSchedule>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "HrShiftSchedule", id },
        { type: "HrShiftSchedule", id: "LIST" },
      ],
    }),

    // ── Swaps ─────────────────────────────────────────────────────────
    listSwaps: build.query<PaginatedResponse<ShiftSwapRequest>, SwapListParams | void>({
      query: (params) => ({
        url: url("/swap-requests"),
        params: params ?? undefined,
      }),
      providesTags: (res) =>
        res
          ? [
              { type: "HrShiftSwap" as const, id: "LIST" },
              ...res.data.map((s) => ({
                type: "HrShiftSwap" as const,
                id: s.id,
              })),
            ]
          : [{ type: "HrShiftSwap", id: "LIST" }],
    }),

    getSwap: build.query<ShiftSwapRequest, string>({
      query: (id) => url(`/swap-requests/${id}`),
      transformResponse: (res: ApiResponse<ShiftSwapRequest>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "HrShiftSwap", id }],
    }),

    requestSwap: build.mutation<ShiftSwapRequest, SwapRequestCreateInput>({
      query: (body) => ({ url: url("/swap-requests"), method: "POST", body }),
      transformResponse: (res: ApiResponse<ShiftSwapRequest>) => res.data,
      invalidatesTags: [
        { type: "HrShiftSwap", id: "LIST" },
        { type: "HrShiftSchedule", id: "LIST" },
      ],
    }),

    respondSwap: build.mutation<ShiftSwapRequest, { id: string; data: SwapRespondInput }>({
      query: ({ id, data }) => ({
        url: url(`/swap-requests/${id}/respond`),
        method: "POST",
        body: data,
      }),
      transformResponse: (res: ApiResponse<ShiftSwapRequest>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "HrShiftSwap", id: arg.id },
        { type: "HrShiftSwap", id: "LIST" },
      ],
    }),

    approveSwap: build.mutation<SwapApproveResult, { id: string; data: SwapApproveInput }>({
      query: ({ id, data }) => ({
        url: url(`/swap-requests/${id}/approve`),
        method: "POST",
        body: data,
      }),
      transformResponse: (res: ApiResponse<SwapApproveResult>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "HrShiftSwap", id: arg.id },
        { type: "HrShiftSwap", id: "LIST" },
        { type: "HrShiftSchedule", id: "LIST" },
      ],
    }),

    cancelSwap: build.mutation<ShiftSwapRequest, string>({
      query: (id) => ({
        url: url(`/swap-requests/${id}/cancel`),
        method: "POST",
      }),
      transformResponse: (res: ApiResponse<ShiftSwapRequest>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "HrShiftSwap", id },
        { type: "HrShiftSwap", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListWorkShiftsQuery,
  useGetWorkShiftQuery,
  useCreateWorkShiftMutation,
  useUpdateWorkShiftMutation,
  useDeactivateWorkShiftMutation,
  useRestoreWorkShiftMutation,
  useListSchedulesQuery,
  useCreateBulkScheduleMutation,
  useUpdateScheduleMutation,
  useCancelScheduleMutation,
  useListSwapsQuery,
  useGetSwapQuery,
  useRequestSwapMutation,
  useRespondSwapMutation,
  useApproveSwapMutation,
  useCancelSwapMutation,
} = shiftsApi;
