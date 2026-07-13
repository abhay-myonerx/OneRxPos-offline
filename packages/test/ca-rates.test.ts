import { describe, it, expect } from "vitest";
import { getProvinceProfile } from "../src/data/ca-rates";

const D = (s: string) => new Date(s);

describe("Canadian rate dataset (effective 2026-07-05)", () => {
  it("ON = single HST 13% (federal+provincial slices sum to 13)", () => {
    const p = getProvinceProfile("ON", D("2026-07-05"));
    const total = p.components.reduce((n, c) => n + Number(c.ratePct), 0);
    expect(total).toBeCloseTo(13, 5);
    expect(p.components.every((c) => c.code === "HST")).toBe(true);
    expect(p.components.some((c) => c.axis === "FEDERAL")).toBe(true);
    expect(p.components.some((c) => c.axis === "PROVINCIAL")).toBe(true);
  });

  it("BC = GST 5% (federal) + PST 7% (provincial)", () => {
    const p = getProvinceProfile("BC", D("2026-07-05"));
    const gst = p.components.find((c) => c.code === "GST");
    const pst = p.components.find((c) => c.code === "PST");
    expect(gst?.ratePct).toBe("5");
    expect(gst?.axis).toBe("FEDERAL");
    expect(pst?.ratePct).toBe("7");
    expect(pst?.axis).toBe("PROVINCIAL");
  });

  it("QC = GST 5% + QST 9.975% and QST is NON-compound (ON_NET)", () => {
    const p = getProvinceProfile("QC", D("2026-07-05"));
    const qst = p.components.find((c) => c.code === "QST");
    expect(qst?.ratePct).toBe("9.975");
    expect(qst?.base).toBe("ON_NET");
  });

  it("AB = GST only", () => {
    const p = getProvinceProfile("AB", D("2026-07-05"));
    expect(p.components).toHaveLength(1);
    expect(p.components[0].code).toBe("GST");
  });

  it("NS = HST 14% today, but 15% before 2025-04-01 (effective dating)", () => {
    const now = getProvinceProfile("NS", D("2026-07-05"));
    const before = getProvinceProfile("NS", D("2025-01-01"));
    expect(now.components.reduce((n, c) => n + Number(c.ratePct), 0)).toBeCloseTo(14, 5);
    expect(before.components.reduce((n, c) => n + Number(c.ratePct), 0)).toBeCloseTo(15, 5);
  });

  it("NS boundary uses LOCAL calendar date, not UTC (late-evening local sale)", () => {
    // Local Mar 31 2025 9pm — still pre-change (rate changes on local Apr 1).
    // If the profile lookup used at.toISOString() (UTC), a store in a
    // negative-UTC-offset timezone at 9pm local on Mar 31 could already be
    // Apr 1 UTC and would incorrectly resolve the post-change 14% profile.
    const local = new Date(2025, 2, 31, 21, 0, 0);
    const p = getProvinceProfile("NS", local);
    expect(p.components.reduce((n, c) => n + Number(c.ratePct), 0)).toBeCloseTo(15, 5);
  });
});
