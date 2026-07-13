// Owns the app-level realtime notification connection. While the authenticated
// user is signed in, this hook keeps the shared Socket.IO connection open and
// listens for `notification:new` events (delivered to the user's per-user room
// by the backend). On each event it surfaces a toast and invalidates the RTK
// Query caches so the bell badge + dropdown refresh.
//
// It deliberately does NOT disconnect the shared socket on unmount — the socket
// is a singleton shared with the POS scanner; the connection is torn down on
// logout instead (see the auth-aware effect below).

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";

import { connectSocket } from "@/lib/socket/socket-client";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { TokenManager } from "@/lib/api/token-manager";
import { notificationsApi } from "../api/notifications.api";
import type { AppNotification } from "../types/notification.types";

export function useNotificationsSocket(): void {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const userId = useAppSelector((s) => s.auth.user?.id);
  const handlerRef = useRef<((n: AppNotification) => void) | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    if (!TokenManager.getAccessToken()) return;

    const socket = connectSocket();

    const onNew = (n: AppNotification) => {
      // Refresh the badge + list. Cheap and always-correct vs. hand-patching
      // the paginated cache.
      dispatch(
        notificationsApi.util.invalidateTags([
          { type: "Notification", id: "LIST" },
          { type: "Notification", id: "UNREAD" },
        ]),
      );
      toast(n.title, { icon: "🔔" });
    };
    handlerRef.current = onNew;

    socket.on("notification:new", onNew);

    return () => {
      socket.off("notification:new", onNew);
      handlerRef.current = null;
    };
  }, [isAuthenticated, userId, dispatch]);
}
