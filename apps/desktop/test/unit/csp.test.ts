import { expect, it } from "vitest";
import { buildCsp } from "../../src/config/csp";

it("includes app: self and the api origin, denies frame-ancestors", () => {
  const csp = buildCsp({ apiOrigin: "http://localhost:4001", dev: false });
  expect(csp).toContain("default-src 'self' app:");
  expect(csp).toContain("connect-src");
  expect(csp).toContain("http://localhost:4001");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
});
it("adds dev server origins only in dev", () => {
  expect(buildCsp({ apiOrigin: "x", dev: true })).toContain(
    "http://localhost:4000",
  );
  expect(buildCsp({ apiOrigin: "x", dev: false })).not.toContain(
    "http://localhost:4000",
  );
});
it("allows 'unsafe-eval' in script-src only in dev", () => {
  expect(buildCsp({ apiOrigin: "x", dev: true })).toMatch(
    /script-src[^;]*'unsafe-eval'/,
  );
  expect(buildCsp({ apiOrigin: "x", dev: false })).not.toMatch(
    /script-src[^;]*'unsafe-eval'/,
  );
});
