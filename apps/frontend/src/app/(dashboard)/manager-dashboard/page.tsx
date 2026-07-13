"use client";

// Thin route wrapper — the real implementation lives in
// src/features/tenant/components/ManagerDashboard.tsx, which is also
// embedded inside the main DashboardPage role-switch.
// A standalone route is kept so that a MANAGER can be deep-linked
// directly to /manager-dashboard without going through the root dispatch.

import { ManagerDashboard } from "@/features/tenant/components/ManagerDashboard";

export default function ManagerDashboardPage() {
  return <ManagerDashboard />;
}
