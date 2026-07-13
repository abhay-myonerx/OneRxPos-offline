"use client";

import { useAppSelector } from "@/store/hooks";
import { Role } from "@/types/enums/role.enums";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@/shell/nav";
import { ROUTES } from "@/constants/routes";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((s) => s.auth.user);
  const navigate = useNavigate();

  if (!user || user.role !== Role.SUPER_ADMIN) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-5">
        <div className="h-16 w-16 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-amber-500" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-medium text-slate-800 dark:text-slate-100">
            Access Restricted
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
            This section is only accessible to Super Admin users. Your current role (
            {user?.role || "Unknown"}) does not have the required permissions.
          </p>
        </div>
        <Button
          variant="outline"
          icon={<ArrowLeft className="h-4 w-4" />}
          onClick={() => navigate(ROUTES.DASHBOARD)}
        >
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
