import type { PaginationParams } from "@/types/common/pagination.types";

// ─── Enums (backend Prisma enums) ──────────────────────────────────────────

export type ShiftScheduleStatus =
  "SCHEDULED" | "COMPLETED" | "ABSENT" | "ON_LEAVE" | "CANCELLED" | "SWAPPED";

export const SHIFT_SCHEDULE_STATUSES: ShiftScheduleStatus[] = [
  "SCHEDULED",
  "COMPLETED",
  "ABSENT",
  "ON_LEAVE",
  "CANCELLED",
  "SWAPPED",
];

export type ShiftSwapStatus =
  "PENDING_PEER" | "PENDING_MANAGER" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";

export const SHIFT_SWAP_STATUSES: ShiftSwapStatus[] = [
  "PENDING_PEER",
  "PENDING_MANAGER",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
];

// ─── Entities ──────────────────────────────────────────────────────────────

export interface WorkShift {
  id: string;
  tenantId: string;
  storeId: string | null;
  name: string;
  code: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"; < startTime ⇒ crosses midnight
  breakMinutes: number;
  graceMinutes: number;
  isNightShift: boolean;
  nightDifferentialPct: string | number | null;
  color: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftSchedule {
  id: string;
  tenantId: string;
  employeeId: string;
  workShiftId: string | null;
  storeId: string | null;
  scheduledDate: string; // ISO date (YYYY-MM-DD as date)
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedBreakMinutes: number;
  plannedGraceMinutes: number;
  isOffDay: boolean;
  status: ShiftScheduleStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Relations the list/detail endpoints embed (backend selects an
  // `employee` + `workShift` summary on each schedule row).
  employee?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    employeeCode?: string | null;
  } | null;
  workShift?: {
    id: string;
    name: string;
    code: string;
    color: string | null;
    startTime: string;
    endTime: string;
  } | null;
}

export interface ShiftSwapRequest {
  id: string;
  tenantId: string;
  requesterEmployeeId: string;
  requesterScheduleId: string;
  counterpartEmployeeId: string;
  counterpartScheduleId: string | null;
  reason: string | null;
  status: ShiftSwapStatus;
  peerRespondedAt: string | null;
  managerUserId: string | null;
  managerRespondedAt: string | null;
  decisionNotes: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Inputs ────────────────────────────────────────────────────────────────

export interface WorkShiftCreateInput {
  name: string;
  code: string;
  storeId?: string | null;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  graceMinutes?: number;
  isNightShift?: boolean;
  nightDifferentialPct?: number | null;
  color?: string | null;
}

export interface WorkShiftUpdateInput extends Partial<WorkShiftCreateInput> {
  isActive?: boolean;
}

export interface WorkShiftListParams extends PaginationParams {
  storeId?: string;
  isActive?: boolean;
  isNightShift?: boolean;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface ScheduleEntryInput {
  employeeId: string;
  scheduledDate: string; // YYYY-MM-DD or ISO
  workShiftId?: string | null;
  storeId?: string | null;
  isOffDay?: boolean;
  notes?: string | null;
}

export interface ScheduleBulkCreateInput {
  entries: ScheduleEntryInput[];
  overrideExisting?: boolean;
}

export interface ScheduleConflict {
  index: number;
  employeeId: string;
  scheduledDate: string;
  reason: string;
  code: string;
}

export interface ScheduleBulkCreateResult {
  created: ShiftSchedule[];
  conflicts: ScheduleConflict[];
}

export interface ScheduleUpdateInput {
  workShiftId?: string | null;
  storeId?: string | null;
  scheduledDate?: string;
  isOffDay?: boolean;
  notes?: string | null;
  status?: ShiftScheduleStatus;
}

export interface ScheduleListParams extends PaginationParams {
  employeeId?: string;
  storeId?: string;
  workShiftId?: string;
  status?: ShiftScheduleStatus;
  from?: string;
  to?: string;
  scope?: "self" | "team" | "all";
  isOffDay?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface SwapRequestCreateInput {
  requesterScheduleId: string;
  counterpartEmployeeId: string;
  counterpartScheduleId?: string | null;
  reason?: string | null;
}

export interface SwapRespondInput {
  accept: boolean;
}

export interface SwapApproveInput {
  approve: boolean;
  decisionNotes?: string | null;
}

export interface SwapListParams extends PaginationParams {
  status?: ShiftSwapStatus;
  scope?: "mine" | "incoming" | "to-approve" | "all";
  from?: string;
  to?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface SwapApproveResult {
  swap: ShiftSwapRequest;
  schedules: unknown;
}

// ─── UI helpers ────────────────────────────────────────────────────────────

export function crossesMidnight(start: string, end: string): boolean {
  return end < start;
}

export function formatPlannedWindow(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  return `${start} – ${end}`;
}
