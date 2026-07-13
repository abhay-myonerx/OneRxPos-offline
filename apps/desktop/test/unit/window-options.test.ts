import { describe, expect, it } from "vitest";
import { buildWindowOptions } from "../../src/config/window-options";

describe("buildWindowOptions", () => {
  const o = buildWindowOptions({ preloadPath: "/x/preload.cjs", kiosk: false });
  it("locks down the renderer", () => {
    expect(o.webPreferences?.contextIsolation).toBe(true);
    expect(o.webPreferences?.nodeIntegration).toBe(false);
    expect(o.webPreferences?.sandbox).toBe(true);
    expect(o.webPreferences?.webSecurity).toBe(true);
    expect(o.webPreferences?.preload).toBe("/x/preload.cjs");
  });
  it("passes kiosk through", () => {
    expect(buildWindowOptions({ preloadPath: "/x", kiosk: true }).kiosk).toBe(
      true,
    );
  });
});
