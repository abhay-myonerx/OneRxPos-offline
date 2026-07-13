import type { PaginationParams } from "@/types/common/pagination.types";

// ─── Enums ────────────────────────────────────────────────────────────────────

export type LeaveRequestStatus =
  "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "CANCELLED_POST";

export const LEAVE_REQUEST_STATUSES: LeaveRequestStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "CANCELLED_POST",
];

export type LeaveAccrualMethod = "ANNUAL_LUMP" | "MONTHLY_ACCRUAL" | "PER_WORKED_DAYS" | "NONE";

export const LEAVE_ACCRUAL_METHODS: LeaveAccrualMethod[] = [
  "ANNUAL_LUMP",
  "MONTHLY_ACCRUAL",
  "PER_WORKED_DAYS",
  "NONE",
];

export type HolidayType = "PUBLIC" | "RELIGIOUS" | "OPTIONAL" | "COMPANY";

export const HOLIDAY_TYPES: HolidayType[] = ["PUBLIC", "RELIGIOUS", "OPTIONAL", "COMPANY"];

export const HOLIDAY_COUNTRY_CODES = ["US", "UK", "IN", "BD", "UAE"] as const;
export type HolidayCountryCode = (typeof HOLIDAY_COUNTRY_CODES)[number];

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface LeaveType {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  isPaid: boolean;
  maxConsecutiveDays: number | null;
  requiresDocument: boolean;
  color: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeavePolicy {
  id: string;
  tenantId: string;
  leaveTypeId: string;
  leaveType?: Pick<LeaveType, "id" | "name" | "code">;
  entitledDaysPerYear: string; // Decimal string
  accrualMethod: LeaveAccrualMethod;
  carryForwardMax: string | null; // Decimal string
  carryForwardExpiryMonths: number | null;
  minTenureMonths: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveBalance {
  id: string;
  tenantId: string;
  employeeId: string;
  leaveTypeId: string;
  leaveType?: Pick<LeaveType, "id" | "name" | "code" | "color">;
  cycleYear: number;
  entitledDays: string; // Decimal string "20.00"
  carriedDays: string;
  usedDays: string;
  pendingDays: string;
  availableDays: string; // derived server-side
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRequestEmployee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

export interface LeaveRequest {
  id: string;
  tenantId: string;
  employeeId: string;
  employee?: LeaveRequestEmployee;
  leaveTypeId: string;
  leaveType?: Pick<LeaveType, "id" | "name" | "code" | "color" | "isPaid">;
  startDate: string; // ISO date
  endDate: string; // ISO date
  isHalfDay: boolean;
  totalDays: string; // Decimal string
  balanceImpactDays: string; // Decimal string
  reason: string | null;
  documentUrl: string | null;
  status: LeaveRequestStatus;
  approverId: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Holiday {
  id: string;
  tenantId: string;
  storeId: string | null;
  name: string;
  date: string; // ISO date
  type: HolidayType;
  isRecurring: boolean;
  countryCode: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HolidayCalendarView {
  year: number;
  storeId: string | null;
  holidays: Array<Pick<Holiday, "id" | "name" | "date" | "type" | "isRecurring" | "countryCode">>;
}

// ─── List params ──────────────────────────────────────────────────────────────

export interface LeaveTypeListParams extends PaginationParams {
  search?: string;
  isActive?: boolean;
}

export interface LeavePolicyListParams extends PaginationParams {
  leaveTypeId?: string;
  isActive?: boolean;
}

export interface LeaveBalanceListParams extends PaginationParams {
  scope?: "self" | "team" | "all";
  employeeId?: string;
  leaveTypeId?: string;
  cycleYear?: number;
}

export interface LeaveRequestListParams extends PaginationParams {
  scope?: "self" | "team" | "all";
  employeeId?: string;
  leaveTypeId?: string;
  status?: LeaveRequestStatus;
  from?: string;
  to?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface HolidayListParams extends PaginationParams {
  storeId?: string;
  year?: number;
  type?: HolidayType;
  isActive?: boolean;
  search?: string;
}

export interface HolidayCalendarParams {
  year: number;
  storeId?: string | null;
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface CreateLeaveTypeInput {
  name: string;
  code: string;
  isPaid?: boolean;
  maxConsecutiveDays?: number | null;
  requiresDocument?: boolean;
  color?: string | null;
}

export type UpdateLeaveTypeInput = Partial<CreateLeaveTypeInput>;

export interface CreateLeavePolicyInput {
  leaveTypeId: string;
  entitledDaysPerYear: number;
  accrualMethod?: LeaveAccrualMethod;
  carryForwardMax?: number | null;
  carryForwardExpiryMonths?: number | null;
  minTenureMonths?: number;
}

export type UpdateLeavePolicyInput = Partial<Omit<CreateLeavePolicyInput, "leaveTypeId">>;

export interface LeaveBalanceAdjustInput {
  employeeId: string;
  leaveTypeId: string;
  cycleYear: number;
  entitledDaysDelta?: number;
  carriedDaysDelta?: number;
  reason: string;
}

export interface CreateLeaveRequestInput {
  employeeId?: string | null; // null = self
  leaveTypeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  isHalfDay?: boolean;
  reason?: string | null;
  documentUrl?: string | null;
}

export type UpdateLeaveRequestInput = Partial<Omit<CreateLeaveRequestInput, "employeeId">>;

export interface LeaveDecisionInput {
  decisionNotes?: string | null;
}

export interface CreateHolidayInput {
  name: string;
  date: string; // YYYY-MM-DD
  type?: HolidayType;
  isRecurring?: boolean;
  countryCode?: string | null;
  storeId?: string | null;
}

export type UpdateHolidayInput = Partial<CreateHolidayInput>;

export interface HolidayImportPresetInput {
  countryCode: HolidayCountryCode;
  year: number;
  storeId?: string | null;
}

export interface HolidayImportPresetResult {
  countryCode: string;
  year: number;
  created: number;
  skipped: number;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

export const LEAVE_STATUS_VARIANTS: Record<
  LeaveRequestStatus,
  "warning" | "success" | "danger" | "outline"
> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "outline",
  CANCELLED_POST: "outline",
};

export const LEAVE_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  CANCELLED_POST: "Cancelled (post-approval)",
};

export const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  PUBLIC: "Public",
  RELIGIOUS: "Religious",
  OPTIONAL: "Optional",
  COMPANY: "Company",
};

export const ACCRUAL_METHOD_LABELS: Record<LeaveAccrualMethod, string> = {
  ANNUAL_LUMP: "Annual lump",
  MONTHLY_ACCRUAL: "Monthly accrual",
  PER_WORKED_DAYS: "Per worked days",
  NONE: "No accrual",
};
