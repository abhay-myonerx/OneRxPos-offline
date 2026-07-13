import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";

import { HR_V2_ROOT } from "./hr-base-url";

import type {
  CreateLeaveRequestInput,
  CreateLeavePolicyInput,
  CreateLeaveTypeInput,
  LeaveBalance,
  LeaveBalanceAdjustInput,
  LeaveBalanceListParams,
  LeaveDecisionInput,
  LeavePolicy,
  LeavePolicyListParams,
  LeaveRequest,
  LeaveRequestListParams,
  LeaveType,
  LeaveTypeListParams,
  UpdateLeaveRequestInput,
  UpdateLeavePolicyInput,
  UpdateLeaveTypeInput,
} from "../types/leave.types";

const url = (path = "") => `${HR_V2_ROOT}/leave${path}`;

export const leaveApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ── Leave Types ───────────────────────────────────────────────────

    listLeaveTypes: build.query<PaginatedResponse<LeaveType>, LeaveTypeListParams | void>({
      query: (params) => ({
        url: url("/types"),
        params: params ?? undefined,
      }),
      providesTags: (res) =>
        res
          ? [
              { type: "HrLeaveType" as const, id: "LIST" },
              ...res.data.map((t) => ({ type: "HrLeaveType" as const, id: t.id })),
            ]
          : [{ type: "HrLeaveType", id: "LIST" }],
    }),

    getLeaveType: build.query<LeaveType, string>({
      query: (id) => url(`/types/${id}`),
      transformResponse: (res: ApiResponse<LeaveType>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "HrLeaveType", id }],
    }),

    createLeaveType: build.mutation<LeaveType, CreateLeaveTypeInput>({
      query: (body) => ({ url: url("/types"), method: "POST", body }),
      transformResponse: (res: ApiResponse<LeaveType>) => res.data,
      invalidatesTags: [{ type: "HrLeaveType", id: "LIST" }],
    }),

    updateLeaveType: build.mutation<LeaveType, { id: string; data: UpdateLeaveTypeInput }>({
      query: ({ id, data }) => ({
        url: url(`/types/${id}`),
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<LeaveType>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "HrLeaveType", id: arg.id },
        { type: "HrLeaveType", id: "LIST" },
      ],
    }),

    deactivateLeaveType: build.mutation<LeaveType, string>({
      query: (id) => ({ url: url(`/types/${id}`), method: "DELETE" }),
      transformResponse: (res: ApiResponse<LeaveType>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "HrLeaveType", id },
        { type: "HrLeaveType", id: "LIST" },
      ],
    }),

    reactivateLeaveType: build.mutation<LeaveType, string>({
      query: (id) => ({
        url: url(`/types/${id}/reactivate`),
        method: "POST",
      }),
      transformResponse: (res: ApiResponse<LeaveType>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "HrLeaveType", id },
        { type: "HrLeaveType", id: "LIST" },
      ],
    }),

    // ── Leave Policies ────────────────────────────────────────────────

    listLeavePolicies: build.query<PaginatedResponse<LeavePolicy>, LeavePolicyListParams | void>({
      query: (params) => ({
        url: url("/policies"),
        params: params ?? undefined,
      }),
      providesTags: (res) =>
        res
          ? [
              { type: "HrLeavePolicy" as const, id: "LIST" },
              ...res.data.map((p) => ({
                type: "HrLeavePolicy" as const,
                id: p.id,
              })),
            ]
          : [{ type: "HrLeavePolicy", id: "LIST" }],
    }),

    createLeavePolicy: build.mutation<LeavePolicy, CreateLeavePolicyInput>({
      query: (body) => ({ url: url("/policies"), method: "POST", body }),
      transformResponse: (res: ApiResponse<LeavePolicy>) => res.data,
      invalidatesTags: [{ type: "HrLeavePolicy", id: "LIST" }],
    }),

    updateLeavePolicy: build.mutation<LeavePolicy, { id: string; data: UpdateLeavePolicyInput }>({
      query: ({ id, data }) => ({
        url: url(`/policies/${id}`),
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<LeavePolicy>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "HrLeavePolicy", id: arg.id },
        { type: "HrLeavePolicy", id: "LIST" },
      ],
    }),

    // ── Leave Balances ────────────────────────────────────────────────

    listLeaveBalances: build.query<PaginatedResponse<LeaveBalance>, LeaveBalanceListParams | void>({
      query: (params) => ({
        url: url("/balances"),
        params: params ?? undefined,
      }),
      providesTags: (res) =>
        res
          ? [
              { type: "HrLeaveBalance" as const, id: "LIST" },
              ...res.data.map((b) => ({
                type: "HrLeaveBalance" as const,
                id: b.id,
              })),
            ]
          : [{ type: "HrLeaveBalance", id: "LIST" }],
    }),

    adjustLeaveBalance: build.mutation<LeaveBalance, LeaveBalanceAdjustInput>({
      query: (body) => ({
        url: url("/balances/adjust"),
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiResponse<LeaveBalance>) => res.data,
      invalidatesTags: [{ type: "HrLeaveBalance", id: "LIST" }],
    }),

    // ── Leave Requests ────────────────────────────────────────────────

    listLeaveRequests: build.query<PaginatedResponse<LeaveRequest>, LeaveRequestListParams | void>({
      query: (params) => ({
        url: url("/requests"),
        params: params ?? undefined,
      }),
      providesTags: (res) =>
        res
          ? [
              { type: "HrLeaveRequest" as const, id: "LIST" },
              ...res.data.map((r) => ({
                type: "HrLeaveRequest" as const,
                id: r.id,
              })),
            ]
          : [{ type: "HrLeaveRequest", id: "LIST" }],
    }),

    getLeaveRequest: build.query<LeaveRequest, string>({
      query: (id) => url(`/requests/${id}`),
      transformResponse: (res: ApiResponse<LeaveRequest>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "HrLeaveRequest", id }],
    }),

    createLeaveRequest: build.mutation<LeaveRequest, CreateLeaveRequestInput>({
      query: (body) => ({ url: url("/requests"), method: "POST", body }),
      transformResponse: (res: ApiResponse<LeaveRequest>) => res.data,
      invalidatesTags: [
        { type: "HrLeaveRequest", id: "LIST" },
        { type: "HrLeaveBalance", id: "LIST" },
      ],
    }),

    updateLeaveRequest: build.mutation<LeaveRequest, { id: string; data: UpdateLeaveRequestInput }>(
      {
        query: ({ id, data }) => ({
          url: url(`/requests/${id}`),
          method: "PATCH",
          body: data,
        }),
        transformResponse: (res: ApiResponse<LeaveRequest>) => res.data,
        invalidatesTags: (_r, _e, arg) => [
          { type: "HrLeaveRequest", id: arg.id },
          { type: "HrLeaveRequest", id: "LIST" },
        ],
      },
    ),

    approveLeaveRequest: build.mutation<LeaveRequest, { id: string; data?: LeaveDecisionInput }>({
      query: ({ id, data }) => ({
        url: url(`/requests/${id}/approve`),
        method: "POST",
        body: data ?? {},
      }),
      transformResponse: (res: ApiResponse<LeaveRequest>) => res.data,
      // A decision clears the "pending approval" alert that fanned out to
      // every approver (backend resolves it server-side); refresh the bell so
      // the acting approver's own badge updates without waiting for the poll.
      invalidatesTags: (_r, _e, arg) => [
        { type: "HrLeaveRequest", id: arg.id },
        { type: "HrLeaveRequest", id: "LIST" },
        { type: "HrLeaveBalance", id: "LIST" },
        { type: "Notification", id: "LIST" },
        { type: "Notification", id: "UNREAD" },
      ],
    }),

    rejectLeaveRequest: build.mutation<LeaveRequest, { id: string; data?: LeaveDecisionInput }>({
      query: ({ id, data }) => ({
        url: url(`/requests/${id}/reject`),
        method: "POST",
        body: data ?? {},
      }),
      transformResponse: (res: ApiResponse<LeaveRequest>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "HrLeaveRequest", id: arg.id },
        { type: "HrLeaveRequest", id: "LIST" },
        { type: "HrLeaveBalance", id: "LIST" },
        { type: "Notification", id: "LIST" },
        { type: "Notification", id: "UNREAD" },
      ],
    }),

    cancelLeaveRequest: build.mutation<LeaveRequest, string>({
      query: (id) => ({ url: url(`/requests/${id}/cancel`), method: "POST" }),
      transformResponse: (res: ApiResponse<LeaveRequest>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "HrLeaveRequest", id },
        { type: "HrLeaveRequest", id: "LIST" },
        { type: "HrLeaveBalance", id: "LIST" },
        { type: "Notification", id: "LIST" },
        { type: "Notification", id: "UNREAD" },
      ],
    }),
  }),
});

export const {
  useListLeaveTypesQuery,
  useGetLeaveTypeQuery,
  useCreateLeaveTypeMutation,
  useUpdateLeaveTypeMutation,
  useDeactivateLeaveTypeMutation,
  useReactivateLeaveTypeMutation,
  useListLeavePoliciesQuery,
  useCreateLeavePolicyMutation,
  useUpdateLeavePolicyMutation,
  useListLeaveBalancesQuery,
  useAdjustLeaveBalanceMutation,
  useListLeaveRequestsQuery,
  useGetLeaveRequestQuery,
  useCreateLeaveRequestMutation,
  useUpdateLeaveRequestMutation,
  useApproveLeaveRequestMutation,
  useRejectLeaveRequestMutation,
  useCancelLeaveRequestMutation,
} = leaveApi;
