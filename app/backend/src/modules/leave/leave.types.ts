// Frozen API contracts published by the leave module and consumed by
// attendance derivation and payroll.
//
// Signatures MUST NOT change without updating:
//   - docs/v2/hrm-deep-dives/4.hrm-leave.md §2 (reverse contract)
//   - docs/v2/hrm-deep-dives/2.hrm-attendance.md §9.1
//   - The payroll deep-dive

export interface IsOnApprovedLeaveResult {
  onLeave: boolean;
  leaveTypeId?: string;
  isPaid?: boolean;
  isHalfDay?: boolean;
}

export interface PaidUnpaidLeaveDaysResult {
  paidDays: number;
  unpaidDays: number;
  byType: Array<{
    leaveTypeId: string;
    leaveTypeName: string;
    isPaid: boolean;
    days: number;
  }>;
}

export interface LeaveActor {
  id: string;
  tenantId: string;
  role: string;
}
