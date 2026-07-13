// Pure unit tests for the DPD schedule → category mapping (Phase 2.1).

import { describe, it, expect } from "vitest";

import { mapDpdScheduleToCategory } from "../schedule-map";
import { DrugScheduleCategory } from "@/generated/prisma/enums";

const { NEEDS_RX, NARCOTIC, BEHIND_COUNTER, OPEN } = DrugScheduleCategory;

describe("mapDpdScheduleToCategory", () => {
  it("maps CDSA controlled classes → NARCOTIC", () => {
    for (const raw of [
      "Narcotic (CDSA)",
      "narcotic",
      "Controlled Drug (CDSA)",
      "Targeted (CDSA)",
      "CDSA",
    ]) {
      expect(mapDpdScheduleToCategory(raw)).toBe(NARCOTIC);
    }
  });

  it("maps prescription classes → NEEDS_RX", () => {
    for (const raw of ["Prescription", "prescription", "Schedule F", "schedule f", "Ethical"]) {
      expect(mapDpdScheduleToCategory(raw)).toBe(NEEDS_RX);
    }
  });

  it("maps pharmacist-only / behind-counter classes → BEHIND_COUNTER", () => {
    for (const raw of ["Schedule II", "schedule ii", "Pharmacist Only", "Behind the counter"]) {
      expect(mapDpdScheduleToCategory(raw)).toBe(BEHIND_COUNTER);
    }
  });

  it("maps OTC / unscheduled / homeopathic / Schedule III → OPEN", () => {
    for (const raw of ["OTC", "otc", "Unscheduled", "Homeopathic", "Schedule III"]) {
      expect(mapDpdScheduleToCategory(raw)).toBe(OPEN);
    }
  });

  it("does NOT let 'Schedule II' swallow 'Schedule III' (numeral collision)", () => {
    expect(mapDpdScheduleToCategory("Schedule III")).toBe(OPEN);
    expect(mapDpdScheduleToCategory("Schedule II")).toBe(BEHIND_COUNTER);
  });

  it("picks the MOST RESTRICTIVE category for a multi-scheduled drug", () => {
    // A joined multi-schedule string (how the importer stores them).
    expect(mapDpdScheduleToCategory("Prescription; Narcotic (CDSA)")).toBe(NARCOTIC);
    expect(mapDpdScheduleToCategory("OTC; Prescription")).toBe(NEEDS_RX);
    expect(mapDpdScheduleToCategory("Schedule II; Prescription")).toBe(NEEDS_RX);
    expect(mapDpdScheduleToCategory("OTC; Schedule II")).toBe(BEHIND_COUNTER);
  });

  it("defaults unknown / empty / null to OPEN", () => {
    expect(mapDpdScheduleToCategory("")).toBe(OPEN);
    expect(mapDpdScheduleToCategory("   ")).toBe(OPEN);
    expect(mapDpdScheduleToCategory(null)).toBe(OPEN);
    expect(mapDpdScheduleToCategory(undefined)).toBe(OPEN);
    expect(mapDpdScheduleToCategory("Some Unrecognized Class")).toBe(OPEN);
  });
});
