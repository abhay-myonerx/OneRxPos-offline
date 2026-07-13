"use client";

// Header bell with an unread badge + dropdown inbox. Mounting this component
// also activates the app-level realtime listener (`useNotificationsSocket`),
// so wherever the bell lives (admin shell or ESS shell) the user receives
// live `notification:new` events. Available to EVERY role.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@/shell/nav";
import {
  Bell,
  CheckCheck,
  Package,
  CalendarDays,
  Clock,
  Wallet,
  ShieldAlert,
  ShoppingCart,
  Info,
} from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { formatTimeAgo } from "@/lib/date/format-date";
import { useNotificationsSocket } from "../hooks/useNotificationsSocket";
import {
  useListNotificationsQuery,
  useUnreadCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} from "../api/notifications.api";
import type { AppNotification, NotificationType } from "../types/notification.types";

const ICONS: Record<NotificationType, typeof Bell> = {
  SYSTEM: Info,
  INVENTORY: Package,
  SALES: ShoppingCart,
  PURCHASE: ShoppingCart,
  HR: CalendarDays,
  ATTENDANCE: Clock,
  LEAVE: CalendarDays,
  SHIFT: Clock,
  PAYROLL: Wallet,
  SECURITY: ShieldAlert,
};

const ICON_TINT: Record<NotificationType, string> = {
  SYSTEM: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
  INVENTORY: "bg-amber-50 dark:bg-warning-500/15 text-amber-600 dark:text-warning-300",
  SALES: "bg-emerald-50 dark:bg-success-500/15 text-emerald-600 dark:text-success-300",
  PURCHASE: "bg-sky-50 dark:bg-primary-400/15 text-sky-600 dark:text-primary-300",
  HR: "bg-violet-50 dark:bg-primary-400/15 text-violet-600 dark:text-primary-300",
  ATTENDANCE: "bg-primary-50 dark:bg-primary-400/15 text-primary-600 dark:text-primary-300",
  LEAVE: "bg-violet-50 dark:bg-primary-400/15 text-violet-600 dark:text-primary-300",
  SHIFT: "bg-primary-50 dark:bg-primary-400/15 text-primary-600 dark:text-primary-300",
  PAYROLL: "bg-emerald-50 dark:bg-success-500/15 text-emerald-600 dark:text-success-300",
  SECURITY: "bg-danger-50 dark:bg-danger-500/15 text-danger-600 dark:text-danger-300",
};

export function NotificationBell() {
  // Keep the realtime connection alive while the bell is mounted.
  useNotificationsSocket();

  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Poll the unread count as a safety net for missed socket events; the socket
  // invalidation keeps it near-instant in practice.
  const { data: unread = 0 } = useUnreadCountQuery(undefined, {
    pollingInterval: 60_000,
  });

  // Only fetch the list while the dropdown is open.
  const { data, isLoading } = useListNotificationsQuery(
    { page: 1, limit: 15, sortOrder: "desc" },
    { skip: !open },
  );
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead, { isLoading: isMarkingAll }] = useMarkAllNotificationsReadMutation();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const items: AppNotification[] = data?.data ?? [];

  const onItemClick = async (n: AppNotification) => {
    if (!n.isRead) {
      try {
        await markRead(n.id).unwrap();
      } catch {
        /* non-fatal — the row stays unread, user can retry */
      }
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative h-10 w-10 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-[360px] max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 animate-scale-in z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Notifications
            </p>
            {unread > 0 && (
              <button
                onClick={() => markAllRead()}
                disabled={isMarkingAll}
                className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  You&apos;re all caught up
                </p>
              </div>
            ) : (
              items.map((n) => {
                const Icon = ICONS[n.type] ?? Info;
                return (
                  <button
                    key={n.id}
                    onClick={() => onItemClick(n)}
                    className={cn(
                      "w-full text-left flex gap-3 px-4 py-3 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors",
                      !n.isRead && "bg-primary-50/40 dark:bg-primary-400/10",
                    )}
                  >
                    <div
                      className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                        ICON_TINT[n.type] ?? ICON_TINT.SYSTEM,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <span className="mt-1.5 h-2 w-2 rounded-full bg-primary-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.body}</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {formatTimeAgo(n.createdAt)}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
