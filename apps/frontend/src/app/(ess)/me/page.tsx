/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Link } from "@/shell/nav";
import { format, addDays, startOfDay } from "date-fns";
import { Clock, CalendarDays, Receipt, Palmtree } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/constants/routes";
import { useGetEssDashboardQuery } from "@/features/ess/api/ess.api";
import { EssStateGate } from "@/features/ess/components/EssStateGate";
import { usePermissions } from "@/hooks/usePermissions";
import { CheckInOutWidget } from "@/features/ess/components/CheckInOutWidget";
import { cn } from "@/lib/utils/cn";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const LEAVE_STATUS_VARIANT: Record<string, "warning" | "success" | "danger" | "outline"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "outline",
  CANCELLED_POST: "outline",
};

const LEAVE_STATUS_DOT: Record<string, string> = {
  PENDING: "bg-amber-400",
  APPROVED: "bg-emerald-400",
  REJECTED: "bg-red-400",
  CANCELLED: "bg-slate-300",
  CANCELLED_POST: "bg-slate-300",
};

export default function EssDashboardPage() {
  const { canAny } = usePermissions();
  const canSee = canAny("ess.profile.read");

  const { data, isLoading, isError, error } = useGetEssDashboardQuery(undefined, {
    skip: !canSee,
  });

  return (
    <EssStateGate
      isLoading={isLoading}
      isError={isError}
      error={error}
      data={data}
      permissionDenied={!canSee}
      missingPermission="ess.profile.read"
      isEmpty={() => false}
    >
      {(d) => {
        // Build 7-day strip
        const today = startOfDay(new Date());
        const weekDays = Array.from({ length: 7 }, (_, i) => addDays(today, i));
        const shiftDateSet = new Set(
          d.upcomingShifts
            .filter((s) => !s.isOffDay)
            .map((s) => format(new Date(s.scheduledDate), "yyyy-MM-dd")),
        );

        return (
          <div className="space-y-4">
            {/* Greeting header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {getGreeting()}
                  {d.profile?.firstName ? `, ${d.profile.firstName}` : ""} 👋
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {format(new Date(), "EEEE, MMMM d, yyyy")}
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1 font-medium">
                  Week {format(new Date(), "w")}
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* CheckIn widget — full width */}
              <div className="lg:col-span-3">
                <CheckInOutWidget today={d.attendanceToday} />
              </div>

              {/* Upcoming shifts card */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4 text-[#4263eb]" />
                    Upcoming shifts
                  </h2>
                  <Link href={ROUTES.ESS_SHIFTS} className="text-xs text-[#4263eb] hover:underline">
                    View all
                  </Link>
                </div>

                {/* 7-day strip */}
                <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
                  {weekDays.map((day) => {
                    const key = format(day, "yyyy-MM-dd");
                    const isToday = key === format(today, "yyyy-MM-dd");
                    const hasShift = shiftDateSet.has(key);
                    return (
                      <div
                        key={key}
                        className={cn(
                          "min-w-[44px] flex flex-col items-center py-1.5 rounded-xl text-xs flex-shrink-0",
                          isToday
                            ? "bg-[#4263eb] text-white font-bold"
                            : hasShift
                              ? "bg-primary-50 dark:bg-primary-400/15 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-400/30 font-medium"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500",
                        )}
                      >
                        <span className="text-[10px] uppercase">{format(day, "EEE")}</span>
                        <span className="font-semibold">{format(day, "d")}</span>
                      </div>
                    );
                  })}
                </div>

                {d.upcomingShifts.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    No upcoming shifts in the next 7 days.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {d.upcomingShifts.slice(0, 4).map((s) => (
                      <li key={s.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-900 dark:text-slate-100">
                          {format(new Date(s.scheduledDate), "EEE, MMM d")}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300">
                          {s.isOffDay ? "Off" : `${s.plannedStart ?? "—"} – ${s.plannedEnd ?? "—"}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Leave balance card with progress bars */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                    <Palmtree className="h-4 w-4 text-[#4263eb]" />
                    Leave balance
                  </h2>
                  <Link href={ROUTES.ESS_LEAVE} className="text-xs text-[#4263eb] hover:underline">
                    Apply
                  </Link>
                </div>
                {d.leaveBalances.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    No leave balance configured yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {d.leaveBalances.slice(0, 4).map((b) => {
                      const avail = Number(b.availableDays ?? 0);
                      const used = Number((b as any).usedDays ?? 0);
                      const total = avail + used;
                      const pct = total > 0 ? (avail / total) * 100 : 100;
                      return (
                        <li key={b.id} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-700 dark:text-slate-200">
                              {b.leaveType?.name ?? "—"}
                            </span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {avail}
                              {total > 0 ? ` / ${total}` : ""} d
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary-500 transition-all duration-300"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              {/* Pending requests card */}
              <Card className="p-4">
                <h2 className="text-sm font-semibold text-slate-900 mb-3 inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-[#4263eb]" />
                  Pending requests
                </h2>
                {d.pendingLeaveRequests.length === 0 ? (
                  <p className="text-sm text-slate-600">No pending requests.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {d.pendingLeaveRequests.slice(0, 5).map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full flex-shrink-0",
                              LEAVE_STATUS_DOT[r.status] ?? "bg-slate-300",
                            )}
                          />
                          <span className="text-slate-700 truncate">
                            {r.leaveType?.name ?? "Leave"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-slate-500 text-xs">
                            {format(new Date(r.startDate), "MMM d")} –{" "}
                            {format(new Date(r.endDate), "MMM d")}
                          </span>
                          <Badge variant={LEAVE_STATUS_VARIANT[r.status] ?? "outline"}>
                            {r.status}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Recent payslips card */}
              <Card className="p-4 md:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-1.5">
                    <Receipt className="h-4 w-4 text-[#4263eb]" />
                    Recent payslips
                  </h2>
                  <Link
                    href={ROUTES.ESS_PAYSLIPS}
                    className="text-xs text-[#4263eb] hover:underline"
                  >
                    View all
                  </Link>
                </div>
                {d.recentPayslips.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No payslips yet — check back after your first pay run is finalized.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {d.recentPayslips.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:border-primary-200 hover:bg-primary-50/30 transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-sm text-slate-900">
                            {format(new Date(p.periodStart), "MMM d")} –{" "}
                            {format(new Date(p.periodEnd), "MMM d, yyyy")}
                          </div>
                          <div className="text-xs text-primary-600 font-semibold mt-0.5">
                            {p.currency}{" "}
                            {Number(p.netPay).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant={p.status === "FINALIZED" ? "success" : "outline"}>
                            {p.status}
                          </Badge>
                          <Link
                            href={`${ROUTES.ESS_PAYSLIPS}/${p.id}`}
                            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            View
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        );
      }}
    </EssStateGate>
  );
}
