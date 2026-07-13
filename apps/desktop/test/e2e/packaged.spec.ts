import path from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("packaged app loads the SPA via app://", async () => {
  const exe = path.join(
    __dirname,
    "..",
    "..",
    "dist-desktop",
    "win-unpacked",
    "RX POS.exe",
  );
  const app = await electron.launch({ executablePath: exe, args: [] });
  const win = await app.firstWindow();
  await expect(win).toHaveTitle(/RX POS/);
  const url = await win.evaluate(() => location.href);
  expect(url.startsWith("app://")).toBe(true);
  await app.close();
});
