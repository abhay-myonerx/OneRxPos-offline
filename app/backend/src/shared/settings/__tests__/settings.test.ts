// Tenant settings namespace helpers.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENABLED_MODULES,
  mergeSettings,
  readAiSettings,
  readBillingSettings,
  readCurrencySettings,
  readEnabledModules,
  readHrSettings,
  readKdsSettings,
  readNotificationsSettings,
  readWebhooksSettings,
} from "../index";

describe("settings — tolerant reads", () => {
  it("reads sensible defaults from an empty settings object", () => {
    const t = { settings: {} };
    expect(readEnabledModules(t)).toEqual(DEFAULT_ENABLED_MODULES);
    expect(readHrSettings(t).payrollCycle).toBe("MONTHLY");
    expect(readAiSettings(t).enabled).toBe(false);
    expect(readNotificationsSettings(t).emailEnabled).toBe(false);
    expect(readWebhooksSettings(t).enabled).toBe(false);
    expect(readKdsSettings(t).enabled).toBe(false);
    expect(readBillingSettings(t).provider).toBe("none");
    expect(readCurrencySettings(t).baseCurrency).toBe("BDT");
  });

  it("reads sensible defaults from settings=null", () => {
    expect(readEnabledModules({ settings: null })).toEqual(DEFAULT_ENABLED_MODULES);
  });

  it("preserves explicit overrides while filling in missing keys", () => {
    const t = {
      settings: {
        enabledModules: { kds: false, "hr.payroll": false },
        hr: { payrollCycle: "WEEKLY" },
      },
    };
    const em = readEnabledModules(t);
    expect(em.kds).toBe(false);
    expect(em["hr.payroll"]).toBe(false);
    // Untouched slugs default to true.
    expect(em.hr).toBe(true);
    expect(em.brands).toBe(true);
    expect(readHrSettings(t).payrollCycle).toBe("WEEKLY");
  });
});

describe("settings — strict writes via mergeSettings", () => {
  it("merges a single-namespace patch into existing settings", () => {
    const current = { hr: { payrollCycle: "MONTHLY" } };
    const merged = mergeSettings(current, {
      enabledModules: { kds: false },
    });
    expect((merged.enabledModules as Record<string, boolean>).kds).toBe(false);
    // hr namespace untouched.
    expect((merged.hr as Record<string, string>).payrollCycle).toBe("MONTHLY");
  });

  it("rejects malformed input at write time", () => {
    expect(() =>
      mergeSettings(
        {},
        // payrollCutoffDay must be 1..31 — 99 throws
        { hr: { payrollCutoffDay: 99 as never } },
      ),
    ).toThrow();
  });

  it("rejects unknown keys when the schema is strict", () => {
    expect(() =>
      mergeSettings(
        {},
        {
          hr: { madeUpField: "x" } as never,
        },
      ),
    ).toThrow();
  });
});
