import type { RouteObject } from "react-router-dom";
import EssLayout from "@/app/(ess)/layout";
import EssDashboardPage from "@/app/(ess)/me/page";
import EssAttendancePage from "@/app/(ess)/me/attendance/page";
import EssDocumentsPage from "@/app/(ess)/me/documents/page";
import EssHolidaysPage from "@/app/(ess)/me/holidays/page";
import EssLeavePage from "@/app/(ess)/me/leave/page";
import EssLeaveApplyPage from "@/app/(ess)/me/leave/apply/page";
import EssPayslipsPage from "@/app/(ess)/me/payslips/page";
import EssPayslipDetailPage from "@/app/(ess)/me/payslips/[id]/page";
import EssProfilePage from "@/app/(ess)/me/profile/page";
import EssShiftsPage from "@/app/(ess)/me/shifts/page";
import { layoutRoute } from "./layoutRoute";

const EssLayoutRoute = layoutRoute(EssLayout);

export const essRoutes: RouteObject[] = [
  {
    element: <EssLayoutRoute />,
    children: [
      { path: "/me", element: <EssDashboardPage /> },
      { path: "/me/attendance", element: <EssAttendancePage /> },
      { path: "/me/documents", element: <EssDocumentsPage /> },
      { path: "/me/holidays", element: <EssHolidaysPage /> },
      { path: "/me/leave", element: <EssLeavePage /> },
      { path: "/me/leave/apply", element: <EssLeaveApplyPage /> },
      { path: "/me/payslips", element: <EssPayslipsPage /> },
      { path: "/me/payslips/:id", element: <EssPayslipDetailPage /> },
      { path: "/me/profile", element: <EssProfilePage /> },
      { path: "/me/shifts", element: <EssShiftsPage /> },
    ],
  },
];
