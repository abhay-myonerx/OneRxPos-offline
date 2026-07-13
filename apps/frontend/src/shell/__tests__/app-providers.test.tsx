import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useSelector } from "react-redux";
import { AppProviders } from "@/shell/AppProviders";
import type { RootState } from "@/store";

function ReadsStore() {
  // Any always-present slice; `auth` exists in this app.
  const ok = useSelector((s: RootState) => s.auth !== undefined);
  return <span>{ok ? "store-ok" : "no-store"}</span>;
}

test("AppProviders supplies the redux store", () => {
  // AppProviders' tree includes SetupGuard, which calls @/shell/nav's
  // usePathname(); under Vitest that alias resolves to the react-router-dom
  // implementation (see vite.config.ts), so it needs a Router ancestor.
  render(
    <MemoryRouter>
      <AppProviders>
        <ReadsStore />
      </AppProviders>
    </MemoryRouter>,
  );
  expect(screen.getByText("store-ok")).toBeInTheDocument();
});
