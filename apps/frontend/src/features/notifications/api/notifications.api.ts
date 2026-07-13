// RTK Query slice for `/api/v2/notifications` — the in-app real-time inbox.

import { baseApi } from "@/store/base-api";
import { env } from "@/shell/env";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type {
  AppNotification,
  NotificationListParams,
  UnreadCount,
} from "../types/notification.types";

// The shared `baseApi` base URL targets `/api/v1`; compute the absolute v2
// root once so the v1 base doesn't leak into notification requests (same
// pattern as the brands slice).
const v1Root = env.apiUrl;
const NOTIF_ROOT = v1Root.replace(/\/api\/v\d+\/?$/, "/api") + "/v2/notifications";

const url = (path = "") => `${NOTIF_ROOT}${path}`;

export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listNotifications: build.query<
      PaginatedResponse<AppNotification>,
      NotificationListParams | void
    >({
      query: (params) => ({ url: url(), params: params ?? undefined }),
      providesTags: (res) =>
        res
          ? [
              { type: "Notification" as const, id: "LIST" },
              ...res.data.map((n) => ({ type: "Notification" as const, id: n.id })),
            ]
          : [{ type: "Notification", id: "LIST" }],
    }),

    unreadCount: build.query<number, void>({
      query: () => url("/unread-count"),
      transformResponse: (res: ApiResponse<UnreadCount>) => res.data.count,
      providesTags: [{ type: "Notification", id: "UNREAD" }],
    }),

    markNotificationRead: build.mutation<AppNotification, string>({
      query: (id) => ({ url: url(`/${id}/read`), method: "PATCH" }),
      transformResponse: (res: ApiResponse<AppNotification>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "Notification", id },
        { type: "Notification", id: "LIST" },
        { type: "Notification", id: "UNREAD" },
      ],
    }),

    markAllNotificationsRead: build.mutation<{ updated: number }, void>({
      query: () => ({ url: url("/read-all"), method: "POST" }),
      transformResponse: (res: ApiResponse<{ updated: number }>) => res.data,
      invalidatesTags: [
        { type: "Notification", id: "LIST" },
        { type: "Notification", id: "UNREAD" },
      ],
    }),
  }),
});

export const {
  useListNotificationsQuery,
  useUnreadCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = notificationsApi;
