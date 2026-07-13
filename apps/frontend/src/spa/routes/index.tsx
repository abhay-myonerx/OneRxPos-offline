import type { RouteObject } from "react-router-dom";
import { Outlet } from "react-router-dom";
import { AppProviders } from "@/shell/AppProviders";
import { authRoutes } from "./auth.routes";
import { dashboardRoutes } from "./dashboard.routes";
import { essRoutes } from "./ess.routes";
import { setupRoutes } from "./setup.routes";

// AppProviders contains SetupGuard, which calls router hooks (usePathname /
// useNavigate). It must render INSIDE the router, so it's the root route's
// element (wrapping an Outlet) rather than a wrapper around RouterProvider.
function Root() {
  return (
    <AppProviders>
      <Outlet />
    </AppProviders>
  );
}

export const routes: RouteObject[] = [
  {
    element: <Root />,
    children: [...setupRoutes, ...authRoutes, ...essRoutes, ...dashboardRoutes],
  },
];

/** Flatten a RouteObject[] to the set of concrete full paths it can render. */
export function collectPaths(rs: RouteObject[], prefix = ""): string[] {
  const out: string[] = [];
  for (const r of rs) {
    const full = r.path ? (r.path.startsWith("/") ? r.path : `${prefix}/${r.path}`) : prefix;
    if (r.path && r.element) out.push(full || "/");
    if (r.children) out.push(...collectPaths(r.children, full));
  }
  return Array.from(new Set(out));
}
