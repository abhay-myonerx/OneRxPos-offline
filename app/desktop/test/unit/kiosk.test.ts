import { expect, it } from "vitest";
import { resolveKiosk, shouldRelaunch } from "../../src/security/kiosk";

it("resolves kiosk from env", () => {
  expect(resolveKiosk({ RXPOS_KIOSK: "1" })).toEqual({
    kiosk: true,
    fullscreen: true,
  });
  expect(resolveKiosk({})).toEqual({ kiosk: false, fullscreen: false });
});
it("stops relaunching after too many crashes in the window", () => {
  const now = 1000;
  expect(shouldRelaunch([], now, { maxRestarts: 3, windowMs: 60000 })).toBe(
    true,
  );
  expect(
    shouldRelaunch([now - 1, now - 2, now - 3], now, {
      maxRestarts: 3,
      windowMs: 60000,
    }),
  ).toBe(false);
  expect(
    shouldRelaunch([now - 90000, now - 80000, now - 70000], now, {
      maxRestarts: 3,
      windowMs: 60000,
    }),
  ).toBe(true);
});
