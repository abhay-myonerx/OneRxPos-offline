import path from "node:path";
import { expect, it } from "vitest";
import { bundleDir, resolveEntry } from "../../src/config/urls";

it("uses the dev server when not packaged", () => {
  expect(
    resolveEntry({ isPackaged: false, devServerUrl: "http://localhost:4000" }),
  ).toEqual({ mode: "dev", url: "http://localhost:4000" });
});
it("serves the packaged bundle from the fixed app:// host", () => {
  expect(
    resolveEntry({ isPackaged: true, devServerUrl: "http://localhost:4000" }),
  ).toEqual({ mode: "prod", url: "app://bundle/index.html" });
});
it("resolves the renderer bundle dir under resourcesPath", () => {
  expect(bundleDir("/res")).toBe(path.join("/res", "renderer"));
});
