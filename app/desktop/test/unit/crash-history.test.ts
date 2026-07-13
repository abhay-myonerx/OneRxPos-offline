import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  loadCrashHistory,
  recordCrashAndShouldRelaunch,
} from "../../src/security/crash-history";

const file = path.join(os.tmpdir(), "rxpos-crash-test-fixed.json");

beforeEach(() => {
  rmSync(file, { force: true });
});
afterEach(() => {
  rmSync(file, { force: true });
});

it("returns [] for loadCrashHistory on a missing file", () => {
  expect(loadCrashHistory(file)).toEqual([]);
});

it("persists crash history to disk so the throttle survives a fresh process", () => {
  // 1st crash: nothing recorded yet -> relaunch
  expect(
    recordCrashAndShouldRelaunch(file, 1000, {
      maxRestarts: 3,
      windowMs: 60000,
    }),
  ).toBe(true);
  // A fresh process would re-read the file here; loadCrashHistory must see it.
  expect(loadCrashHistory(file)).toEqual([1000]);

  // 2nd crash: 2 within window -> still relaunch
  expect(
    recordCrashAndShouldRelaunch(file, 1001, {
      maxRestarts: 3,
      windowMs: 60000,
    }),
  ).toBe(true);

  // 3rd crash: 3 within window, maxRestarts:3 -> throttle fires (no relaunch)
  expect(
    recordCrashAndShouldRelaunch(file, 1002, {
      maxRestarts: 3,
      windowMs: 60000,
    }),
  ).toBe(false);
});

it("prunes crashes outside the window, allowing relaunch again", () => {
  recordCrashAndShouldRelaunch(file, 1000, { maxRestarts: 3, windowMs: 60000 });
  recordCrashAndShouldRelaunch(file, 1001, { maxRestarts: 3, windowMs: 60000 });
  recordCrashAndShouldRelaunch(file, 1002, { maxRestarts: 3, windowMs: 60000 });

  // Far outside the 60s window -> old ones pruned, only this new one counts.
  expect(
    recordCrashAndShouldRelaunch(file, 1000 + 90000, {
      maxRestarts: 3,
      windowMs: 60000,
    }),
  ).toBe(true);
});
