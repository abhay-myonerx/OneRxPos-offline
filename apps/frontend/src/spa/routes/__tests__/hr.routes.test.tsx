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

// This task (Task 11) owns the (dashboard)/hr subtree, minus payroll
// (Task 12) and minus the full-group glob parity check (Task 13). So we
// assert against a hardcoded list of the 21 hr paths this task is
// responsible for, rather than globbing the whole (dashboard) group.
const HR_PATHS = [
  "/hr/attendance",
  "/hr/attendance/corrections",
  "/hr/attendance/corrections/new",
  "/hr/departments",
  "/hr/designations",
  "/hr/employees",
  "/hr/employees/new",
  "/hr/employees/:id",
  "/hr/employees/:id/edit",
  "/hr/holidays",
  "/hr/holidays/calendar",
  "/hr/leave",
  "/hr/leave/balances",
  "/hr/leave/policies",
  "/hr/leave/requests",
  "/hr/leave/requests/:id",
  "/hr/shifts",
  "/hr/shifts/schedule",
  "/hr/shifts/schedule/new",
  "/hr/shifts/swaps",
  "/hr/shifts/swaps/new",
];

test("dashboard route table covers every (dashboard)/hr page for this task", () => {
  const covered = collectPaths(routes);
  for (const p of HR_PATHS) {
    expect(covered).toContain(p);
  }
});

test("dynamic hr routes are registered with :id params", () => {
  const covered = collectPaths(routes);
  expect(covered).toContain("/hr/employees/:id");
  expect(covered).toContain("/hr/employees/:id/edit");
  expect(covered).toContain("/hr/leave/requests/:id");
});

// DashboardLayout hydrates auth then calls useGetMeQuery to verify the
// session with the backend. `fetch` is stubbed globally (see
// vitest.setup.ts) to reject immediately, so the /auth/me call fails
// deterministically and RouteGuard/DashboardLayout redirect to /login. We
// assert on that redirect rather than on hr chrome — actually rendering an
// hr page isn't reachable unauthenticated in jsdom, so this is the
// deterministic smoke check.
test("hr route redirects to login once the session check fails (no backend in jsdom)", async () => {
  mountAt("/hr/employees");

  expect(
    await screen.findByRole("heading", { name: /welcome back/i }, { timeout: 3000 }),
  ).toBeInTheDocument();
});
