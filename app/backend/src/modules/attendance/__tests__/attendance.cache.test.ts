// Derivation cache.

import { beforeEach, describe, expect, it } from "vitest";

import { attendanceDerivationCache, invalidateForPunch } from "../attendance.cache";

const cache = attendanceDerivationCache;

beforeEach(() => cache.clear());

describe("attendance derivation cache", () => {
  it("returns null on a cold miss", () => {
    expect(cache.get("t1", "e1", "2026-06-01")).toBeNull();
  });

  it("round-trips a set/get for the same key", () => {
    cache.set("t1", "e1", "2026-06-01", { status: "PRESENT" });
    expect(cache.get("t1", "e1", "2026-06-01")).toEqual({ status: "PRESENT" });
  });

  it("isolates by tenant + employee + date", () => {
    cache.set("t1", "e1", "2026-06-01", "A");
    cache.set("t2", "e1", "2026-06-01", "B");
    cache.set("t1", "e2", "2026-06-01", "C");
    cache.set("t1", "e1", "2026-06-02", "D");
    expect(cache.get("t1", "e1", "2026-06-01")).toBe("A");
    expect(cache.get("t2", "e1", "2026-06-01")).toBe("B");
    expect(cache.get("t1", "e2", "2026-06-01")).toBe("C");
    expect(cache.get("t1", "e1", "2026-06-02")).toBe("D");
  });

  it("invalidate clears a single entry only", () => {
    cache.set("t1", "e1", "2026-06-01", "A");
    cache.set("t1", "e1", "2026-06-02", "B");
    cache.invalidate("t1", "e1", "2026-06-01");
    expect(cache.get("t1", "e1", "2026-06-01")).toBeNull();
    expect(cache.get("t1", "e1", "2026-06-02")).toBe("B");
  });

  it("invalidateEmployee clears every cached date for one employee", () => {
    cache.set("t1", "e1", "2026-06-01", "A");
    cache.set("t1", "e1", "2026-06-02", "B");
    cache.set("t1", "e2", "2026-06-01", "C");
    cache.invalidateEmployee("t1", "e1");
    expect(cache.get("t1", "e1", "2026-06-01")).toBeNull();
    expect(cache.get("t1", "e1", "2026-06-02")).toBeNull();
    expect(cache.get("t1", "e2", "2026-06-01")).toBe("C");
  });

  it("invalidateForPunch derives the iso day from occurredAt", () => {
    cache.set("t1", "e1", "2026-06-01", "X");
    invalidateForPunch("t1", "e1", new Date("2026-06-01T15:23:11Z"));
    expect(cache.get("t1", "e1", "2026-06-01")).toBeNull();
  });
});
