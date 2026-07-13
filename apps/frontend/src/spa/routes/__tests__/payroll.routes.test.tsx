import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routes, collectPaths } from "../index";

// Mount the FULL route tree (root route = AppProviders wrapping an Outlet, see
// routes/index.tsx). AppProviders contains SetupGuard, which calls router
// hooks (usePathname/useNavigate) — it must render INSIDE the router, so we
// never wrap AppProviders manually in tests, only via the real route tree.
function mountAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  localStorage.clear();
});

// This task (Task 12) owns the (dashboard)/hr/payroll subtree — the last
// route-porting task. Hardcoded list of the 7 payroll paths (mirrors the
// pattern in hr.routes.test.tsx / Task 11).
const PAYROLL_PATHS = [
  "/hr/payroll",
  "/hr/payroll/advances",
  "/hr/payroll/runs",
  "/hr/payroll/runs/:id",
  "/hr/payroll/salaries",
  "/hr/payroll/structures",
  "/hr/payroll/structures/:id",
];

test("dashboard route table covers every (dashboard)/hr/payroll page for this task", () => {
  const covered = collectPaths(routes);
  for (const p of PAYROLL_PATHS) {
    expect(covered).toContain(p);
  }
});

test("dynamic payroll routes are registered with :id params", () => {
  const covered = collectPaths(routes);
  expect(covered).toContain("/hr/payroll/runs/:id");
  expect(covered).toContain("/hr/payroll/structures/:id");
});

// /hr/payroll has no page of its own — it's a redirect shim (Next: `page.tsx`
// calls `redirect("/hr/payroll/runs")`; SPA: a <Navigate replace/> route) that
// forwards to /hr/payroll/runs. In jsdom there's no backend, so
// DashboardLayout's session check (see hr.routes.test.tsx) then fails and
// RouteGuard/DashboardLayout redirect onward to /login. The redirect chain is
// therefore /hr/payroll -> /hr/payroll/runs -> /login. We assert the
// deterministic END of that chain (the /login heading) rather than the
// intermediate /hr/payroll/runs location, because DashboardLayout's guard
// redirect fires asynchronously (after the failed useGetMeQuery) and can win
// the race before a synchronous assertion on router.state.location would
// observe the intermediate URL. We also assert the index redirect actually
// fired by checking the final location is not /hr/payroll.
test("/hr/payroll redirects to /hr/payroll/runs (and on to /login unauthenticated)", async () => {
  const router = mountAt("/hr/payroll");

  expect(
    await screen.findByRole("heading", { name: /welcome back/i }, { timeout: 3000 }),
  ).toBeInTheDocument();
  await waitFor(() => expect(router.state.location.pathname).not.toBe("/hr/payroll"));
});

// DashboardLayout hydrates auth then calls useGetMeQuery to verify the
// session with the backend. `fetch` is stubbed globally (see
// vitest.setup.ts) to reject immediately, so the /auth/me call fails
// deterministically and RouteGuard/DashboardLayout redirect to /login. We
// assert on that redirect rather than on payroll chrome — actually rendering
// a payroll page isn't reachable unauthenticated in jsdom, so this is the
// deterministic smoke check.
test("payroll route redirects to login once the session check fails (no backend in jsdom)", async () => {
  mountAt("/hr/payroll/runs");

  expect(
    await screen.findByRole("heading", { name: /welcome back/i }, { timeout: 3000 }),
  ).toBeInTheDocument();
});
