"use client";

// Wraps dashboard pages and silently redirects users who lack permission for the
// current route. Avoids ever rendering an "access denied" page — users only see
// the routes they can actually use.

import { useEffect, useMemo } from "react";
import { usePathname, useNavigate } from "@/shell/nav";
import { useAppSelector } from "@/store/hooks";
import { Role } from "@/types/enums/role.enums";
import { hasAllPermissions, hasAnyPermission } from "@/lib/permissions/has-permission";
import { getRouteAccess, getDefaultLandingForRole } from "@/lib/permissions/route-permissions";

interface RouteGuardProps {
  children: React.ReactNode;
}

export function RouteGuard({ children }: RouteGuardProps) {
  const navigate = useNavigate();
  const pathname = usePathname();
  const user = useAppSelector((s) => s.auth.user);

  const allowed = useMemo(() => {
    if (!user) return false;
    if (user.role === Role.SUPER_ADMIN) return true;

    const access = getRouteAccess(pathname);
    if (!access) return true; // unprotected page

    if (access.exactRole) return user.role === access.exactRole;
    if (access.roles && !access.roles.includes(user.role)) return false;
    if (access.allOf?.length && !hasAllPermissions(user, ...access.allOf)) return false;
    if (access.anyOf?.length && !hasAnyPermission(user, ...access.anyOf)) return false;

    return true;
  }, [user, pathname]);

  useEffect(() => {
    if (!user || allowed) return;
    const fallback = getDefaultLandingForRole(user.role);
    if (pathname !== fallback) navigate(fallback, { replace: true });
  }, [user, allowed, pathname, navigate]);

  if (!user) return null;
  if (!allowed) return null;

  return <>{children}</>;
}
