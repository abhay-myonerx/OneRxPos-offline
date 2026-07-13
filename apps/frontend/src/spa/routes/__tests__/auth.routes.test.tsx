import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routes, collectPaths } from "../index";
import { authRoutes } from "../auth.routes";
import { expectedPaths } from "../../test-utils/route-manifest";

// Mount the FULL route tree (root route = AppProviders wrapping an Outlet, see
// routes/index.tsx). AppProviders contains SetupGuard, which calls router
// hooks (usePathname/useNavigate) — it must render INSIDE the router, so we
// never wrap AppProviders manually in tests, only via the real route tree.
function mountAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

test("login route renders the login screen", () => {
  mountAt("/login");
  // SetupGuard is fail-open (no backend in jsdom -> no redirect); AuthLayout
  // only redirects when authenticated (default false). The login page's h1
  // is "Welcome back" (verified in src/app/(auth)/login/page.tsx).
  expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
});

test("auth route table covers every (auth) page", () => {
  const covered = collectPaths(authRoutes);
  for (const p of expectedPaths(["src/app/(auth)/**/page.tsx"])) {
    if (p === "/") continue; // root redirect is handled by setup.routes
    expect(covered).toContain(p);
  }
});
