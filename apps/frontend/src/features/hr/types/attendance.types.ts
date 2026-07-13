export type CheckEventType = "CHECK_IN" | "CHECK_OUT" | "BREAK_START" | "BREAK_END";

export type AttendanceMethod =
  "MANUAL" | "WEB" | "MOBILE_APP" | "GEOFENCE" | "IP_RESTRICTED" | "QR_CODE" | "BIOMETRIC";

export type AttendanceCorrectionStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type AttendanceStatus =
  "PRESENT" | "ABSENT" | "HALF_DAY" | "ON_LEAVE" | "HOLIDAY" | "WEEKEND" | "OFF";

export type AttendanceLiveState = "CHECKED_IN" | "ON_BREAK" | "CHECKED_OUT" | "NOT_STARTED";

export type AttendanceScope = "self" | "team" | "all";

export interface AttendanceRecord {
  id: string;
  tenantId: string;
  employeeId: string;
  storeId: string | null;
  scheduledShiftId: string | null;
  eventType: CheckEventType;
  occurredAt: string;
  method: AttendanceMethod;
  geoLat: string | null;
  geoLng: string | null;
  geoAccuracyM: number | null;
  ipAddress: string | null;
  deviceId: string | null;
  photoUrl: string | null;
  isRegularized: boolean;
  correctionId: string | null;
  notes: string | null;
  createdAt: string;
  createdByUserId: string | null;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
  };
}

export interface AttendanceCurrentStatus {
  state: AttendanceLiveState;
  sinceAt: string | null;
  lastEventId: string | null;
}

export interface PunchResult {
  record: AttendanceRecord;
  current: AttendanceCurrentStatus;
  warnings: string[];
  deduplicated: boolean;
}

export interface PunchInput {
  employeeId?: string | null;
  method?: AttendanceMethod;
  occurredAt?: string;
  geo?: { lat: number; lng: number; accuracyM?: number } | null;
  deviceId?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
}

export interface AttendanceListParams {
  page?: number;
  limit?: number;
  sortBy?: "occurredAt" | "createdAt" | "eventType";
  sortOrder?: "asc" | "desc";
  scope?: AttendanceScope;
  employeeId?: string;
  storeId?: string;
  eventType?: CheckEventType;
  method?: AttendanceMethod;
  from?: string;
  to?: string;
}

export interface TodayPayload {
  events: AttendanceRecord[];
  current: AttendanceCurrentStatus;
  date: string;
}

export interface DerivedDay {
  date: string;
  status: AttendanceStatus;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  firstIn: string | null;
  lastOut: string | null;
  breakMinutes: number;
  flags: string[];
  sourceEventIds: string[];
  hasOpenSession: boolean;
}

export interface SummaryTotals {
  presentDays: number;
  halfDays: number;
  absentDays: number;
  onLeaveDays: number;
  holidayDays: number;
  offDays: number;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  breakMinutes: number;
}

export interface SingleEmployeeSummary {
  employeeId: string;
  days: DerivedDay[];
  totals: SummaryTotals;
}

export interface MultiEmployeeSummary {
  employees: SingleEmployeeSummary[];
}

export type SummaryResult = SingleEmployeeSummary | MultiEmployeeSummary;

export interface SummaryParams {
  employeeId?: string;
  from: string;
  to: string;
}

export interface AttendanceCorrection {
  id: string;
  tenantId: string;
  employeeId: string;
  requestedDate: string;
  eventType: CheckEventType;
  requestedTime: string;
  reason: string;
  evidenceUrl: string | null;
  status: AttendanceCorrectionStatus;
  managerUserId: string | null;
  managerRespondedAt: string | null;
  managerNotes: string | null;
  resultingRecordId: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    reportsToId: string | null;
  };
}

export interface CorrectionCreateInput {
  employeeId?: string | null;
  requestedDate: string;
  eventType: CheckEventType;
  requestedTime: string;
  reason: string;
  evidenceUrl?: string | null;
}

export interface CorrectionListParams {
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "updatedAt" | "requestedDate" | "status";
  sortOrder?: "asc" | "desc";
  scope?: AttendanceScope;
  employeeId?: string;
  status?: AttendanceCorrectionStatus;
  from?: string;
  to?: string;
}

export interface CorrectionDecisionInput {
  managerNotes?: string | null;
}

export interface ApprovalResult {
  correction: AttendanceCorrection;
  record: AttendanceRecord;
}

export const CHECK_EVENT_TYPES: CheckEventType[] = [
  "CHECK_IN",
  "CHECK_OUT",
  "BREAK_START",
  "BREAK_END",
];

export const ATTENDANCE_METHODS: AttendanceMethod[] = [
  "MANUAL",
  "WEB",
  "MOBILE_APP",
  "GEOFENCE",
  "IP_RESTRICTED",
  "QR_CODE",
  "BIOMETRIC",
];

export const CORRECTION_STATUSES: AttendanceCorrectionStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

export function isSingleEmployeeSummary(s: SummaryResult): s is SingleEmployeeSummary {
  return (s as SingleEmployeeSummary).days !== undefined;
}

export function formatMinutesAsHours(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0h";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
