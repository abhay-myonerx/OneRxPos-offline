import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";
import PayrollLayout from "@/app/(dashboard)/hr/payroll/layout";
import PayrollAdvancesPage from "@/app/(dashboard)/hr/payroll/advances/page";
import PayrollRunsPage from "@/app/(dashboard)/hr/payroll/runs/page";
import PayrollRunDetailPage from "@/app/(dashboard)/hr/payroll/runs/[id]/page";
import PayrollSalariesPage from "@/app/(dashboard)/hr/payroll/salaries/page";
import PayrollStructuresPage from "@/app/(dashboard)/hr/payroll/structures/page";
import PayrollStructureDetailPage from "@/app/(dashboard)/hr/payroll/structures/[id]/page";
import { layoutRoute } from "./layoutRoute";

const PayrollLayoutRoute = layoutRoute(PayrollLayout);

// (dashboard)/hr/payroll subtree (Task 12) — the last route-porting task.
// Unlike hr.routes.tsx, payroll HAS its own layout
// ((dashboard)/hr/payroll/layout.tsx -> PayrollLayout), so this block is
// wrapped in its own layoutRoute and meant to be spread into
// DashboardLayoutRoute's children in dashboard.routes.tsx, giving
// DashboardLayout -> PayrollLayout -> payroll page nesting.
//
// `/hr/payroll` has no page of its own: the Next `page.tsx` there is a
// redirect shim (`redirect("/hr/payroll/runs")`). We mirror that with a
// react-router-dom `Navigate` so the path still resolves for parity.
export const payrollRoutes: RouteObject[] = [
  {
    element: <PayrollLayoutRoute />,
    children: [
      { path: "/hr/payroll", element: <Navigate to="/hr/payroll/runs" replace /> },
      { path: "/hr/payroll/advances", element: <PayrollAdvancesPage /> },
      { path: "/hr/payroll/runs", element: <PayrollRunsPage /> },
      { path: "/hr/payroll/runs/:id", element: <PayrollRunDetailPage /> },
      { path: "/hr/payroll/salaries", element: <PayrollSalariesPage /> },
      { path: "/hr/payroll/structures", element: <PayrollStructuresPage /> },
      { path: "/hr/payroll/structures/:id", element: <PayrollStructureDetailPage /> },
    ],
  },
];
