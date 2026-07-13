import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routes, collectPaths } from "../index";

// Mount the FULL route tree (root route = AppProviders wrapping an Outlet, see
// routes/index.tsx). AppProviders contains SetupGuard, which calls router
// hooks (usePathname/useNavigate) — it must render INSIDE the router, so we
// never wrap AppProviders manually in tests, only via the real route tree.
function mountAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  localStorage.clear();
});

// This task (Task 10) owns only a SUBSET of the (dashboard) route group —
// HR and payroll subtrees are ported in Tasks 11-12, and the full-group glob
// parity check lives in Task 13. So we assert against a hardcoded list of the
// 25 core paths this task is responsible for, rather than globbing the whole
// (dashboard) group (which would fail until Tasks 11-13 land).
const CORE_DASHBOARD_PATHS = [
  "/dashboard",
  "/manager-dashboard",
  "/pos",
  "/sales",
  "/reports",
  "/reports/hr",
  "/profile",
  "/settings",
  "/permissions",
  "/users",
  "/stores",
  "/receipt-settings",
  "/expenses",
  "/purchases",
  "/suppliers",
  "/brands",
  "/categories",
  "/customers",
  "/customers/:id",
  "/products",
  "/products/:id",
  "/inventory",
  "/inventory/transfers/:id",
  "/admin/tenants",
  "/admin/tenants/:id",
];

test("dashboard route table covers every core (dashboard) page for this task", () => {
  const covered = collectPaths(routes);
  for (const p of CORE_DASHBOARD_PATHS) {
    expect(covered).toContain(p);
  }
});

test("dynamic dashboard routes are registered with :id params", () => {
  const covered = collectPaths(routes);
  expect(covered).toContain("/customers/:id");
  expect(covered).toContain("/products/:id");
  expect(covered).toContain("/inventory/transfers/:id");
  expect(covered).toContain("/admin/tenants/:id");
});

// DashboardLayout hydrates auth then calls useGetMeQuery to verify the
// session with the backend. `fetch` is stubbed globally (see
// vitest.setup.ts) to reject immediately, so the /auth/me call fails
// deterministically and RouteGuard/DashboardLayout redirect to /login. We
// assert on that redirect rather than on dashboard chrome — actually
// rendering a dashboard page isn't reachable unauthenticated in jsdom, so
// this is the deterministic smoke check.
test("dashboard route redirects to login once the session check fails (no backend in jsdom)", async () => {
  mountAt("/dashboard");

  expect(await screen.findByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
});
