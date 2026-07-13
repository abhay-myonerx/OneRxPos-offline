import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routes, collectPaths } from "../index";
import { essRoutes } from "../ess.routes";
import { expectedPaths } from "../../test-utils/route-manifest";
import { Role } from "@/types/enums/role.enums";
import { TenantPlan } from "@/types/enums/status.enums";

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

test("ess route table covers every (ess) page", () => {
  const covered = collectPaths(essRoutes);
  for (const p of expectedPaths(["src/app/(ess)/**/page.tsx"])) {
    expect(covered).toContain(p);
  }
});

// EssLayout hydrates auth from localStorage (pos_user/pos_tenant, see
// TokenManager) then calls useGetMeQuery to verify the session with the
// backend. `fetch` is stubbed globally (see vitest.setup.ts) to reject
// immediately, so even with a seeded "authenticated" user the /auth/me call
// fails deterministically, the layout dispatches logout(), and it navigates
// to /login (see src/app/(ess)/layout.tsx's isMeError effect). We assert on
// that redirect rather than on ESS chrome — this exercises the guard's real
// fail-closed behavior, it doesn't bypass it.
test("ess route redirects to login once the session check fails (no backend in jsdom)", async () => {
  localStorage.setItem(
    "pos_user",
    JSON.stringify({
      id: "u1",
      email: "employee@example.com",
      firstName: "Jane",
      lastName: "Doe",
      role: Role.EMPLOYEE,
    }),
  );
  localStorage.setItem(
    "pos_tenant",
    JSON.stringify({
      id: "t1",
      name: "Test Tenant",
      slug: "test-tenant",
      plan: TenantPlan.STARTER,
    }),
  );

  mountAt("/me/profile");

  expect(
    await screen.findByRole("heading", { name: /welcome back/i }, { timeout: 3000 }),
  ).toBeInTheDocument();
});
