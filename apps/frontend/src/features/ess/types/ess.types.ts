import type { PaginationParams } from "@/types/common/pagination.types";
import type { Payslip, PayslipStatus } from "@/features/hr/types/payroll.types";
import type {
  LeaveRequest,
  LeaveRequestStatus,
  LeaveBalance,
  LeaveType,
  Holiday,
} from "@/features/hr/types/leave.types";
import type { ShiftSchedule } from "@/features/hr/types/shift.types";
import type { AttendanceRecord, AttendanceMethod } from "@/features/hr/types/attendance.types";

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface EssProfile {
  id: string;
  employeeCode: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  emergencyContact: EssEmergencyContact | null;
  photo: string | null;
  employmentStatus: string;
  employmentType: string;
  employmentStartDate: string;
  confirmationDate: string | null;
  department?: { id: string; name: string; code: string } | null;
  designation?: { id: string; title: string; code: string } | null;
  storeId: string | null;
  reportsTo?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface EssEmergencyContact {
  name?: string | null;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface UpdateEssProfileInput {
  phone?: string | null;
  alternatePhone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  emergencyContact?: EssEmergencyContact | null;
  photo?: string | null;
  preferences?: {
    languagePreference?: string;
    themePreference?: "light" | "dark" | "system";
    [key: string]: unknown;
  };
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export type EssPunchEventType = "CHECK_IN" | "CHECK_OUT" | "BREAK_START" | "BREAK_END";

export interface EssAttendanceListParams extends PaginationParams {
  eventType?: EssPunchEventType;
  from?: string;
  to?: string;
}

export interface EssPunchInput {
  method?: AttendanceMethod;
  occurredAt?: string;
  geo?: { lat: number; lng: number; accuracyM?: number } | null;
  deviceId?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
}

export interface EssPunchResult {
  record: { id: string; [k: string]: unknown };
  current: unknown;
  warnings: string[];
  deduplicated?: boolean;
}

export interface EssTodayAttendance {
  events: AttendanceRecord[];
  current: {
    state: "NOT_STARTED" | "OUT" | "CHECKED_IN" | "ON_BREAK" | "CHECKED_OUT" | string;
    [k: string]: unknown;
  };
  date: string;
}

export interface EssRegularizeInput {
  requestedDate: string;
  eventType: EssPunchEventType;
  requestedTime: string;
  reason: string;
  evidenceUrl?: string | null;
}

export interface EssSummaryParams {
  from: string;
  to: string;
}

// ─── Shifts ───────────────────────────────────────────────────────────────────

export interface EssShiftsListParams extends PaginationParams {
  from?: string;
  to?: string;
  isOffDay?: boolean;
}

export interface EssSwapRequestInput {
  requesterScheduleId: string;
  counterpartEmployeeId: string;
  counterpartScheduleId?: string | null;
  reason?: string | null;
}

export interface EssSwapRespondInput {
  accept: boolean;
}

// ─── Leave ────────────────────────────────────────────────────────────────────

export interface EssLeaveRequestListParams extends PaginationParams {
  leaveTypeId?: string;
  status?: LeaveRequestStatus;
  from?: string;
  to?: string;
}

export interface EssLeaveApplyInput {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  isHalfDay?: boolean;
  reason?: string | null;
  documentUrl?: string | null;
}

export interface EssLeaveBalanceParams {
  leaveTypeId?: string;
  cycleYear?: number;
}

// ─── Payslips ─────────────────────────────────────────────────────────────────

export interface EssPayslipsListParams extends PaginationParams {
  status?: PayslipStatus;
  from?: string;
  to?: string;
}

// ─── Holidays ─────────────────────────────────────────────────────────────────

export interface EssHolidaysParams {
  year: number;
}

export interface EssHolidaysResponse {
  year: number;
  storeId: string | null;
  holidays: Holiday[];
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface EssDashboard {
  profile: EssProfile | null;
  attendanceToday: EssTodayAttendance | null;
  upcomingShifts: ShiftSchedule[];
  leaveBalances: LeaveBalance[];
  pendingLeaveRequests: LeaveRequest[];
  recentPayslips: Payslip[];
}

// Re-export some types used by ESS pages for convenience.
export type { LeaveType, LeaveRequest, LeaveBalance, ShiftSchedule, Payslip };
