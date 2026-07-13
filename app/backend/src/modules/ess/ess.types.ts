// Types for the ESS module. ESS owns no business types beyond a thin
// actor and the resolved-self shape; everything else is delegated to
// owning modules (employee/attendance/shift/leave/payroll/holiday).

export interface EssActor {
  id: string;
  tenantId: string;
  role: string;
}

export interface ResolvedSelf {
  id: string;
  tenantId: string;
  userId: string | null;
  storeId: string | null;
  employmentStatus: string;
  isActive: boolean;
  reportsToId: string | null;
}
