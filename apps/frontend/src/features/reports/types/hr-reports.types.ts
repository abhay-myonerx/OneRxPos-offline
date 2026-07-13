export interface DateRange {
  from: string;
  to: string;
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardSummaryQuery {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
}

export interface DashboardSummaryData {
  period: DateRange;
  sales: {
    periodCount: number;
    periodRevenue: number;
    periodAvgSaleValue: number;
    todayCount: number;
    todayRevenue: number;
  };
  people: {
    activeEmployees: number;
    checkInsToday: number;
    currentlyOnLeave: number;
    pendingLeaveRequests: number;
  };
  catalog: {
    activeProducts: number;
    activeStores: number;
  };
}

// ── Employee summary ─────────────────────────────────────────────────────────

export interface EmployeeReportQuery {
  storeId?: string;
  departmentId?: string;
}

export interface EmployeeReportData {
  summary: {
    total: number;
    active: number;
    onLeave: number;
    terminated: number;
    newHiresLast30Days: number;
  };
  byStatus: { status: string; count: number }[];
  byType: { type: string; count: number }[];
  byDepartment: {
    departmentId: string;
    departmentName: string;
    departmentCode: string;
    count: number;
  }[];
  byStore: {
    storeId: string | null;
    storeName: string;
    storeCode: string;
    count: number;
  }[];
}

// ── Attendance summary ───────────────────────────────────────────────────────

export interface AttendanceReportQuery {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  departmentId?: string;
  employeeId?: string;
}

export interface AttendanceReportData {
  period: DateRange;
  summary: {
    activeEmployees: number;
    totalEvents: number;
    checkIns: number;
    checkOuts: number;
    uniqueAttendees: number;
    regularizedEvents: number;
    pendingCorrections: number;
    approvedCorrections: number;
    rejectedCorrections: number;
  };
  byEventType: { eventType: string; count: number }[];
  byMethod: { method: string; count: number }[];
  correctionsByStatus: { status: string; count: number }[];
}

// ── Leave summary ────────────────────────────────────────────────────────────

export interface LeaveReportQuery {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  departmentId?: string;
  employeeId?: string;
  leaveTypeId?: string;
}

export interface LeaveReportData {
  period: DateRange;
  summary: {
    totalRequests: number;
    totalDays: number;
    totalBalanceImpactDays: number;
    pending: number;
    approved: number;
    rejected: number;
    cancelled: number;
    currentlyOnLeave: number;
  };
  byStatus: { status: string; count: number; totalDays: number }[];
  byType: {
    leaveTypeId: string;
    name: string;
    code: string;
    color: string | null;
    approvedRequests: number;
    approvedDays: number;
  }[];
}

// ── Payroll summary ──────────────────────────────────────────────────────────

export interface PayrollReportQuery {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  status?: "DRAFT" | "PROCESSING" | "PROCESSED" | "APPROVED" | "DISBURSED" | "CANCELLED" | "FAILED";
}

export interface PayrollRecentRun {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  payCycle: string;
  status: string;
  totalGross: string;
  totalNet: string;
  totalDeductions: string;
  employeeCount: number;
}

export interface PayrollReportData {
  period: DateRange;
  summary: {
    totalRuns: number;
    totalGross: number;
    totalNet: number;
    totalDeductions: number;
    totalEmployeesPaid: number;
    totalPayslips: number;
    payslipGrossTotal: number;
    payslipNetTotal: number;
  };
  runsByStatus: {
    status: string;
    count: number;
    totalGross: number;
    totalNet: number;
    totalDeductions: number;
  }[];
  payslipsByStatus: {
    status: string;
    count: number;
    totalGross: number;
    totalNet: number;
  }[];
  recentRuns: PayrollRecentRun[];
}

// ── Activity ─────────────────────────────────────────────────────────────────

export interface ActivityReportQuery {
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  entityType?: string;
  action?: string;
  limit?: number;
}

export interface ActivityItem {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  createdAt: string;
}

export interface ActivityReportData {
  period: DateRange;
  summary: {
    totalEvents: number;
    shown: number;
  };
  items: ActivityItem[];
}
