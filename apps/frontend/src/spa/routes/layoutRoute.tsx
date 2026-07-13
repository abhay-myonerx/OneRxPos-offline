import { Outlet } from "react-router-dom";
import type { ComponentType, ReactNode } from "react";

// App-Router layouts take `{children}`; React Router layout routes render
// `<Outlet/>` for their matched child. This adapter lets us reuse the same
// Next.js layout components as React Router "layout route" elements.
export function layoutRoute(Layout: ComponentType<{ children: ReactNode }>) {
  return function LayoutRoute() {
    return (
      <Layout>
        <Outlet />
      </Layout>
    );
  };
}
