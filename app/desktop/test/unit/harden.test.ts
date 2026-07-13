import { expect, it } from "vitest";
import { shouldBlockNavigation } from "../../src/security/harden";

it("allows app:// and the dev server, blocks everything else", () => {
  expect(
    shouldBlockNavigation("app://index.html", "app://index.html#/pos", false),
  ).toBe(false);
  expect(
    shouldBlockNavigation("app://index.html", "https://evil.example", false),
  ).toBe(true);
  expect(
    shouldBlockNavigation(
      "http://localhost:4000/",
      "http://localhost:4000/#/x",
      true,
    ),
  ).toBe(false);
  expect(
    shouldBlockNavigation(
      "http://localhost:4000/",
      "https://evil.example",
      true,
    ),
  ).toBe(true);
});
