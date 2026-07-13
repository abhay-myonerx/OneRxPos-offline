import type { RouteObject } from "react-router-dom";
import HrAttendancePage from "@/app/(dashboard)/hr/attendance/page";
import HrAttendanceCorrectionsPage from "@/app/(dashboard)/hr/attendance/corrections/page";
import HrAttendanceCorrectionsNewPage from "@/app/(dashboard)/hr/attendance/corrections/new/page";
import HrDepartmentsPage from "@/app/(dashboard)/hr/departments/page";
import HrDesignationsPage from "@/app/(dashboard)/hr/designations/page";
import HrEmployeesPage from "@/app/(dashboard)/hr/employees/page";
import HrEmployeeNewPage from "@/app/(dashboard)/hr/employees/new/page";
import HrEmployeeDetailPage from "@/app/(dashboard)/hr/employees/[id]/page";
import HrEmployeeEditPage from "@/app/(dashboard)/hr/employees/[id]/edit/page";
import HrHolidaysPage from "@/app/(dashboard)/hr/holidays/page";
import HrHolidaysCalendarPage from "@/app/(dashboard)/hr/holidays/calendar/page";
import HrLeavePage from "@/app/(dashboard)/hr/leave/page";
import HrLeaveBalancesPage from "@/app/(dashboard)/hr/leave/balances/page";
import HrLeavePoliciesPage from "@/app/(dashboard)/hr/leave/policies/page";
import HrLeaveRequestsPage from "@/app/(dashboard)/hr/leave/requests/page";
import HrLeaveRequestDetailPage from "@/app/(dashboard)/hr/leave/requests/[id]/page";
import HrShiftsPage from "@/app/(dashboard)/hr/shifts/page";
import HrShiftsSchedulePage from "@/app/(dashboard)/hr/shifts/schedule/page";
import HrShiftsScheduleNewPage from "@/app/(dashboard)/hr/shifts/schedule/new/page";
import HrShiftsSwapsPage from "@/app/(dashboard)/hr/shifts/swaps/page";
import HrShiftsSwapsNewPage from "@/app/(dashboard)/hr/shifts/swaps/new/page";

// (dashboard)/hr subtree (Task 11), minus payroll (`/hr/payroll/*`, Task 12).
// There is no hr-specific layout under (dashboard)/hr — only
// (dashboard)/layout.tsx, (dashboard)/admin/layout.tsx, and
// (dashboard)/hr/payroll/layout.tsx exist — so this is a FLAT list of route
// objects meant to be spread into DashboardLayoutRoute's children in
// dashboard.routes.tsx, not wrapped in its own layoutRoute.
export const hrRoutes: RouteObject[] = [
  { path: "/hr/attendance", element: <HrAttendancePage /> },
  { path: "/hr/attendance/corrections", element: <HrAttendanceCorrectionsPage /> },
  { path: "/hr/attendance/corrections/new", element: <HrAttendanceCorrectionsNewPage /> },
  { path: "/hr/departments", element: <HrDepartmentsPage /> },
  { path: "/hr/designations", element: <HrDesignationsPage /> },
  { path: "/hr/employees", element: <HrEmployeesPage /> },
  { path: "/hr/employees/new", element: <HrEmployeeNewPage /> },
  { path: "/hr/employees/:id", element: <HrEmployeeDetailPage /> },
  { path: "/hr/employees/:id/edit", element: <HrEmployeeEditPage /> },
  { path: "/hr/holidays", element: <HrHolidaysPage /> },
  { path: "/hr/holidays/calendar", element: <HrHolidaysCalendarPage /> },
  { path: "/hr/leave", element: <HrLeavePage /> },
  { path: "/hr/leave/balances", element: <HrLeaveBalancesPage /> },
  { path: "/hr/leave/policies", element: <HrLeavePoliciesPage /> },
  { path: "/hr/leave/requests", element: <HrLeaveRequestsPage /> },
  { path: "/hr/leave/requests/:id", element: <HrLeaveRequestDetailPage /> },
  { path: "/hr/shifts", element: <HrShiftsPage /> },
  { path: "/hr/shifts/schedule", element: <HrShiftsSchedulePage /> },
  { path: "/hr/shifts/schedule/new", element: <HrShiftsScheduleNewPage /> },
  { path: "/hr/shifts/swaps", element: <HrShiftsSwapsPage /> },
  { path: "/hr/shifts/swaps/new", element: <HrShiftsSwapsNewPage /> },
];
