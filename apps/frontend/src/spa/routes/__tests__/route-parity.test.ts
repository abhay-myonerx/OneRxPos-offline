import { routes, collectPaths } from "../index";
import { expectedPaths } from "../../test-utils/route-manifest";

test("SPA router covers every app/ page route (all pages)", () => {
  const covered = new Set(collectPaths(routes));
  const missing = expectedPaths(["src/app/**/page.tsx"]).filter(
    (p) => p !== "/" && !covered.has(p),
  );
  expect(missing).toEqual([]);
});
