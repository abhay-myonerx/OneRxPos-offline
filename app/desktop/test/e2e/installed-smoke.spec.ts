import { test, expect, _electron as electron } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";

// Verifies the ACTUALLY-INSTALLED app (from running the NSIS installer), not
// the loose win-unpacked build. Point RXPOS_INSTALLED_EXE at the installed
// "RX POS.exe" (silent install: `"RX POS Setup <v>.exe" /S /D=<dir>`). Skips
// when unset so the normal suite isn't tied to a prior install step.
test.skip(
  !process.env.RXPOS_INSTALLED_EXE,
  "set RXPOS_INSTALLED_EXE to the installed RX POS.exe",
);
test("installed app boots, bridge is alive, SPA renders, backend reachable", async () => {
  const exe = process.env.RXPOS_INSTALLED_EXE as string;

  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "rxpos-installed-"));
  const app = await electron.launch({
    executablePath: exe as string,
    args: [`--user-data-dir=${userDataDir}`],
  });
  const out: string[] = [];
  app.process().stdout?.on("data", (d: Buffer) => out.push("[out] " + d.toString()));
  app.process().stderr?.on("data", (d: Buffer) => out.push("[err] " + d.toString()));

  let win: Awaited<ReturnType<typeof app.firstWindow>> | null = null;
  try {
    win = await app.firstWindow({ timeout: 35000 });
  } catch {
    console.log("=== NO WINDOW. Installed-app boot log ===\n" + out.join(""));
    await app.close().catch(() => {});
    throw new Error("installed app did not open a window");
  }

  const result = await win.evaluate(async () => {
    const w = window as unknown as { rxpos?: { apiOrigin?: string | null } };
    for (let i = 0; i < 60; i++) {
      const origin = w.rxpos?.apiOrigin ?? null;
      if (origin) {
        try {
          const r = await fetch(origin + "/api/health");
          if (r.ok) return { origin, health: r.status };
        } catch {
          /* still booting */
        }
      }
      await new Promise((res) => setTimeout(res, 500));
    }
    return { origin: null, health: 0 };
  });
  console.log("=== installed boot log ===\n" + out.join(""));
  expect(result.origin, "bridge.apiOrigin").toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(result.health).toBe(200);
  await expect
    .poll(() => win!.evaluate(() => document.getElementById("root")?.childElementCount ?? 0), {
      timeout: 20000,
    })
    .toBeGreaterThan(0);
  await app.close().catch(() => {});
});
