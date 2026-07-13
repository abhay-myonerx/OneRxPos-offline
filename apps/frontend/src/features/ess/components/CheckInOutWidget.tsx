"use client";

import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { LogIn, LogOut, Coffee, Timer } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import {
  useEssCheckInMutation,
  useEssCheckOutMutation,
  useEssBreakStartMutation,
  useEssBreakEndMutation,
} from "@/features/ess/api/ess.api";
import { parseEssError } from "@/features/ess/lib/ess-error";
import type { EssTodayAttendance } from "@/features/ess/types/ess.types";

interface Props {
  today: EssTodayAttendance | null;
}

function formatHMS(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

export function CheckInOutWidget({ today }: Props) {
  const [checkIn, ci] = useEssCheckInMutation();
  const [checkOut, co] = useEssCheckOutMutation();
  const [breakStart, bs] = useEssBreakStartMutation();
  const [breakEnd, be] = useEssBreakEndMutation();

  const [now, setNow] = useState(() => Date.now());

  const busy = ci.isLoading || co.isLoading || bs.isLoading || be.isLoading;
  const state = today?.current?.state ?? "NOT_STARTED";
  const lastEvent = today?.events?.[today.events.length - 1];
  const lastTime = lastEvent?.occurredAt ? format(new Date(lastEvent.occurredAt), "h:mm a") : null;

  // Tick every second when active
  useEffect(() => {
    if (state !== "CHECKED_IN" && state !== "ON_BREAK") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state]);

  // Compute worked/break time from event log
  const { workedMs, breakMs } = useMemo(() => {
    const events = today?.events;
    if (!events) return { workedMs: 0, breakMs: 0 };
    let worked = 0,
      brk = 0,
      openIn: number | null = null,
      openBreak: number | null = null;
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
  }, [today?.events, now]);

  async function handle(action: () => ReturnType<typeof checkIn>) {
    try {
      const result = await action().unwrap();
      const warnings = result.warnings ?? [];
      if (result.deduplicated) {
        showSuccess("Already recorded (duplicate ignored)");
      } else {
        showSuccess(
          warnings.length > 0 ? `Recorded with warning: ${warnings.join(", ")}` : "Recorded",
        );
      }
    } catch (err) {
      const ess = parseEssError(err);
      if (ess.isEmploymentInactive) {
        showApiError({
          status: 403,
          data: { error: { code: ess.code, message: ess.detail } },
        });
      } else {
        showApiError(err);
      }
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      {/* Top row: date + status badge */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              state === "CHECKED_IN"
                ? "bg-success-500 animate-pulse"
                : state === "ON_BREAK"
                  ? "bg-warning-500 animate-pulse"
                  : "bg-slate-300",
            )}
          />
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Today &middot; {format(new Date(), "EEEE, MMMM d")}
          </span>
        </div>
        <Badge
          variant={
            state === "CHECKED_IN"
              ? "success"
              : state === "ON_BREAK"
                ? "warning"
                : state === "CHECKED_OUT"
                  ? "info"
                  : "outline"
          }
        >
          {state === "NOT_STARTED" || state === "OUT"
            ? "Not started"
            : state === "CHECKED_IN"
              ? "Checked in"
              : state === "ON_BREAK"
                ? "On break"
                : "Checked out"}
        </Badge>
      </div>

      {/* Status message */}
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
        {(state === "OUT" || state === "NOT_STARTED") && "You haven't checked in yet today."}
        {state === "CHECKED_IN" && `Checked in${lastTime ? ` at ${lastTime}` : ""}.`}
        {state === "ON_BREAK" && `On break${lastTime ? ` since ${lastTime}` : ""}.`}
        {state === "CHECKED_OUT" && `Checked out${lastTime ? ` at ${lastTime}` : ""}.`}
      </p>

      {/* Live timer row — only when active */}
      {(state === "CHECKED_IN" || state === "ON_BREAK") && (
        <div className="flex items-center gap-4 mb-4 py-3 px-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
          <div className="flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
            <span className="font-mono text-lg font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
              {formatHMS(workedMs)}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">worked</span>
          </div>
          {breakMs > 0 && (
            <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-800 pl-4">
              <Coffee className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              <span className="font-mono text-sm font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                {formatHMS(breakMs)}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">break</span>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {(state === "OUT" || state === "NOT_STARTED" || state === "CHECKED_OUT") && (
          <Button
            onClick={() => handle(() => checkIn({ method: "WEB" }))}
            disabled={busy}
            leftIcon={<LogIn className="h-4 w-4" />}
          >
            Check in
          </Button>
        )}
        {state === "CHECKED_IN" && (
          <>
            <Button
              variant="outline"
              onClick={() => handle(() => breakStart({ method: "WEB" }))}
              disabled={busy}
              leftIcon={<Coffee className="h-4 w-4" />}
            >
              Start break
            </Button>
            <Button
              variant="danger"
              onClick={() => handle(() => checkOut({ method: "WEB" }))}
              disabled={busy}
              leftIcon={<LogOut className="h-4 w-4" />}
            >
              Check out
            </Button>
          </>
        )}
        {state === "ON_BREAK" && (
          <Button
            onClick={() => handle(() => breakEnd({ method: "WEB" }))}
            disabled={busy}
            leftIcon={<Coffee className="h-4 w-4" />}
          >
            End break
          </Button>
        )}
      </div>
    </Card>
  );
}
