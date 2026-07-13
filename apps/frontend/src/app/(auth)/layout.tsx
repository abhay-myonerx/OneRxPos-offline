"use client";

import { useEffect } from "react";
import { useNavigate } from "@/shell/nav";
import { useAppSelector } from "@/store/hooks";
import { ROUTES } from "@/constants/routes";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) navigate(ROUTES.DASHBOARD, { replace: true });
  }, [isAuthenticated, navigate]);

  return <div className="auth-bg">{children}</div>;
}
