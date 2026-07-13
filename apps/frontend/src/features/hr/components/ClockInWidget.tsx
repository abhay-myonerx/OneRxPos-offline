"use client";

// Clock-in / clock-out / break widget. Drives the four punch endpoints
// against `/api/v2/hr/attendance/*`. The current state comes from
// `GET /today` (always live thanks to RTK Query tag invalidation on
// every punch).
//
// Permission gate is implicit — without `ess.attendance.check-in` the
// caller will get a 403 from the backend. We hide the widget when the
// user has no ESS / no employee link (the today endpoint surfaces the
// `NO_LINKED_EMPLOYEE` error and we render a soft message instead).

import { useEffect, useMemo, useState } from "react";
import { LogIn, LogOut, Coffee, Play, Loader2, Timer, CheckCircle2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { showApiError, showSuccess } from "@/lib/api/error-handler";

import {
  useGetTodayQuery,
  useCheckInMutation,
  useCheckOutMutation,
  useBreakStartMutation,
  useBreakEndMutation,
} from "../api/attendance.api";
import { type AttendanceLiveState, type PunchInput } from "../types/attendance.types";

interface ParsedError {
  status?: number;
  data?: { error?: { code?: string; message?: string } };
}
function errorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return;
  const e = err as ParsedError;
  return e.data?.error?.code;
}

function stateLabel(state: AttendanceLiveState): string {
  switch (state) {
    case "CHECKED_IN":
      return "Working";
    case "ON_BREAK":
      return "On break";
    case "CHECKED_OUT":
      return "Checked out";
    case "NOT_STARTED":
    default:
      return "Not started";
  }
}

// Per-state visual tokens for the status orb / accent / label.
function stateStyle(state: AttendanceLiveState) {
  switch (state) {
    case "CHECKED_IN":
      return {
        orb: "bg-success-50 dark:bg-success-500/15 text-success-600 dark:text-success-300",
        dot: "bg-success-500",
        text: "text-success-700 dark:text-success-300",
        bar: "bg-success-500",
        Icon: Timer,
        live: true,
      };
    case "ON_BREAK":
      return {
        orb: "bg-warning-50 dark:bg-warning-500/15 text-warning-600 dark:text-warning-300",
        dot: "bg-warning-500",
        text: "text-warning-700 dark:text-warning-300",
        bar: "bg-warning-500",
        Icon: Coffee,
        live: true,
      };
    case "CHECKED_OUT":
      return {
        orb: "bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300",
        dot: "bg-primary-400",
        text: "text-primary-700 dark:text-primary-300",
        bar: "bg-primary-400",
        Icon: CheckCircle2,
        live: false,
      };
    default:
      return {
        orb: "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500",
        dot: "bg-slate-300",
        text: "text-slate-500 dark:text-slate-400",
        bar: "bg-slate-300",
        Icon: LogIn,
        live: false,
      };
  }
}

function formatHMS(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function ClockInWidget() {
  const { data, isLoading, isError, error, refetch } = useGetTodayQuery();
  const [checkIn, { isLoading: checkingIn }] = useCheckInMutation();
  const [checkOut, { isLoading: checkingOut }] = useCheckOutMutation();
  const [breakStart, { isLoading: breakStarting }] = useBreakStartMutation();
  const [breakEnd, { isLoading: breakEnding }] = useBreakEndMutation();

  const busy = checkingIn || checkingOut || breakStarting || breakEnding;

  const noLinkedEmployee = useMemo(() => errorCode(error) === "NO_LINKED_EMPLOYEE", [error]);

  // Tick every second so the worked / break counters update live while a
  // session is open. The interval stops once the user is checked out.
  const liveState = data?.current.state ?? "NOT_STARTED";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (liveState !== "CHECKED_IN" && liveState !== "ON_BREAK") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [liveState]);

  // Walk today's events to derive net worked + break time. Still-open
  // segments are counted up to `now` for a live count.
  const { workedMs, breakMs } = useMemo(() => {
    const events = data?.events ?? [];
    let worked = 0;
    let brk = 0;
    let openIn: number | null = null;
    let openBreak: number | null = null;
    for (const e of events) {
      const t = new Date(e.occurredAt).getTime();
      if (e.eventType === "CHECK_IN") openIn = t;
      else if (e.eventType === "CHECK_OUT" && openIn != null) {
        worked += t - openIn;
        openIn = null;
      } else if (e.eventType === "BREAK_START") openBreak = t;
      else if (e.eventType === "BREAK_END" && openBreak != null) {
        brk += t - openBreak;
        openBreak = null;
      }
    }
    if (openBreak != null) brk += now - openBreak;
    if (openIn != null) worked += now - openIn;
    return { workedMs: Math.max(0, worked - brk), breakMs: Math.max(0, brk) };
  }, [data?.events, now]);

  async function runPunch(label: string, fn: (b: PunchInput) => Promise<unknown>) {
    try {
      const body: PunchInput = { method: "WEB" };
      // Best-effort geolocation — non-fatal if denied or unavailable.
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 3000,
              maximumAge: 30000,
            }),
          );
          body.geo = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: Math.round(pos.coords.accuracy),
          };
        } catch {
          /* geolocation denied/unavailable — submit without it */
        }
      }
      await fn(body);
      showSuccess(label);
    } catch (err) {
      showApiError(err);
    }
  }

  if (noLinkedEmployee) {
    return (
      <Card>
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Time tracker
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Your account isn&apos;t linked to an employee profile yet. Ask HR to link it to enable
            self-service attendance.
          </p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading tracker…
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Couldn&apos;t load your status.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  const state = data?.current.state ?? "NOT_STARTED";
  const sinceAt = data?.current.sinceAt ? new Date(data.current.sinceAt) : null;

  const isCheckedIn = state === "CHECKED_IN";
  const isOnBreak = state === "ON_BREAK";

  const s = stateStyle(state);
  const totalMs = workedMs + breakMs;
  const workedPct = totalMs > 0 ? (workedMs / totalMs) * 100 : 0;
  const breakPct = totalMs > 0 ? (breakMs / totalMs) * 100 : 0;

  return (
    <Card className="relative overflow-hidden">
      <span className={cn("absolute inset-y-0 left-0 w-1")} />

      <div className="flex flex-col gap-5 pl-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl",
              s.orb,
            )}
          >
            <s.Icon className="h-6 w-6" />
            {s.live && (
              <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5">
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                    s.dot,
                  )}
                />
                <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", s.dot)} />
              </span>
            )}
          </div>

          <div className="min-w-0">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Time tracker
            </span>
            <div className="mt-0.5 text-4xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl">
              {formatHMS(workedMs)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm text-slate-500 dark:text-slate-400">
              <span className={cn("font-medium", s.text)}>{stateLabel(state)}</span>
              {sinceAt && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>
                    since{" "}
                    {sinceAt.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </>
              )}
              <span className="text-slate-300">·</span>
              <span>
                break{" "}
                <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">
                  {formatHMS(breakMs)}
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {state === "NOT_STARTED" || state === "CHECKED_OUT" ? (
            <Button
              size="lg"
              icon={<LogIn className="h-4 w-4" />}
              onClick={() => runPunch("Checked in", (b) => checkIn(b).unwrap())}
              disabled={busy}
            >
              Check in
            </Button>
          ) : null}

          {isCheckedIn ? (
            <>
              <Button
                variant="secondary"
                icon={<Coffee className="h-4 w-4" />}
                onClick={() => runPunch("Break started", (b) => breakStart(b).unwrap())}
                disabled={busy}
              >
                Break
              </Button>
              <Button
                variant="outline"
                icon={<LogOut className="h-4 w-4" />}
                onClick={() => runPunch("Checked out", (b) => checkOut(b).unwrap())}
                disabled={busy}
              >
                Check out
              </Button>
            </>
          ) : null}

          {isOnBreak ? (
            <>
              <Button
                icon={<Play className="h-4 w-4" />}
                onClick={() => runPunch("Back from break", (b) => breakEnd(b).unwrap())}
                disabled={busy}
              >
                Resume
              </Button>
              <Button
                variant="outline"
                icon={<LogOut className="h-4 w-4" />}
                onClick={() => runPunch("Checked out", (b) => checkOut(b).unwrap())}
                disabled={busy}
              >
                Check out
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {totalMs > 0 && (
        <div className="mt-5 flex h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 pl-0">
          <div className="bg-success-500" style={{ width: `${workedPct}%` }} />
          <div className="bg-warning-400" style={{ width: `${breakPct}%` }} />
        </div>
      )}
    </Card>
  );
}
