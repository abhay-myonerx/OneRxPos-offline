// Socket.IO emission for attendance events.
//
// Per hrm-deep-dives/2.hrm-attendance.md §12, every successful
// punch broadcasts to the room
//   tenant:{tenantId}:store:{storeId}:attendance
// so a live manager dashboard can render the floor in real-time.
//
// Privacy: payload includes only the minimum identifiers + the
// event metadata — no PII (no email, no phone, no salary). The
// employee name is included because the manager dashboard needs
// to render "Sara just checked in" — that's already visible to
// the same set of managers in any other HR view.
//
// The emission is fire-and-forget — failures are logged but never
// block the punch. This module is also safe to call when Socket.IO
// hasn't been initialised (e.g. in unit tests).

import { logger } from "../shared/utils/logger";

let ioRef: import("socket.io").Server | null = null;

/** Wired once at startup from `src/server.ts` after `initSocketIO`. */
export function setAttendanceIO(io: import("socket.io").Server): void {
  ioRef = io;
}

/** Test-only — lets the suite clear the singleton between cases. */
export function __resetAttendanceIOForTests(): void {
  ioRef = null;
}

export type AttendancePublicEvent =
  | "attendance.checked-in"
  | "attendance.checked-out"
  | "attendance.break-started"
  | "attendance.break-ended"
  | "attendance.correction-approved";

interface EmitInput {
  tenantId: string;
  storeId: string | null;
  employeeId: string;
  employeeName: string;
  eventType: AttendancePublicEvent;
  occurredAt: Date;
  method?: string | null;
}

/**
 * Emits the attendance event to every manager in the matching
 * tenant+store room. No-op when storeId is null (off-store
 * employees) — there's no logical room to target.
 */
export function emitAttendanceEvent(payload: EmitInput): void {
  if (!ioRef) return;
  if (!payload.storeId) return;
  const room = `tenant:${payload.tenantId}:store:${payload.storeId}:attendance`;
  try {
    ioRef.to(room).emit(payload.eventType, {
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      storeId: payload.storeId,
      occurredAt: payload.occurredAt.toISOString(),
      method: payload.method ?? null,
    });
  } catch (err) {
    // Never propagate — the punch already committed.
    logger.warn(
      { err, room, eventType: payload.eventType },
      "Failed to emit attendance socket event",
    );
  }
}

/**
 * Maps the internal punch event verb to the public socket event
 * name. The internal verbs (CHECK_IN, CHECK_OUT, BREAK_START,
 * BREAK_END) are stable in the DB; the public names use the dotted
 * convention so they group nicely with future modules.
 */
export function punchEventTypeToSocketEvent(eventType: string): AttendancePublicEvent | null {
  switch (eventType) {
    case "CHECK_IN":
      return "attendance.checked-in";
    case "CHECK_OUT":
      return "attendance.checked-out";
    case "BREAK_START":
      return "attendance.break-started";
    case "BREAK_END":
      return "attendance.break-ended";
    default:
      return null;
  }
}
