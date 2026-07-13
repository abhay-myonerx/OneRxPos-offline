import { describe, it, expect } from "vitest";

import {
  buildDateList,
  deriveCurrentStatus,
  deriveDay,
  deriveRange,
  type DerivationEvent,
} from "../attendance.derivation";

function ev(id: string, type: DerivationEvent["eventType"], iso: string): DerivationEvent {
  return { id, eventType: type, occurredAt: new Date(iso) };
}

const DATE = new Date(Date.UTC(2026, 4, 20)); // 2026-05-20

describe("deriveDay — empty / off / holiday / leave", () => {
  it("returns ABSENT on a working day with no events", () => {
    const d = deriveDay([], { date: DATE });
    expect(d.status).toBe("ABSENT");
    expect(d.workedMinutes).toBe(0);
    expect(d.flags).toContain("ABSENT");
  });

  it("returns OFF on a non-working day with no events", () => {
    const d = deriveDay([], { date: DATE, isWorkingDay: false });
    expect(d.status).toBe("OFF");
  });

  it("HOLIDAY beats everything", () => {
    const d = deriveDay([ev("1", "CHECK_IN", "2026-05-20T09:00:00Z")], {
      date: DATE,
      isHoliday: true,
    });
    expect(d.status).toBe("HOLIDAY");
    expect(d.workedMinutes).toBe(0);
  });

  it("ON_LEAVE wins when leave overlaps and not a holiday", () => {
    const d = deriveDay([], { date: DATE, onLeave: true });
    expect(d.status).toBe("ON_LEAVE");
  });
});

describe("deriveDay — single in/out pair", () => {
  it("computes workedMinutes from one full pair", () => {
    const d = deriveDay(
      [ev("a", "CHECK_IN", "2026-05-20T09:00:00Z"), ev("b", "CHECK_OUT", "2026-05-20T17:00:00Z")],
      { date: DATE },
    );
    expect(d.workedMinutes).toBe(8 * 60);
    expect(d.status).toBe("PRESENT");
    expect(d.firstIn).toEqual(new Date("2026-05-20T09:00:00Z"));
    expect(d.lastOut).toEqual(new Date("2026-05-20T17:00:00Z"));
    expect(d.hasOpenSession).toBe(false);
  });

  it("subtracts break intervals", () => {
    const d = deriveDay(
      [
        ev("a", "CHECK_IN", "2026-05-20T09:00:00Z"),
        ev("b", "BREAK_START", "2026-05-20T12:00:00Z"),
        ev("c", "BREAK_END", "2026-05-20T13:00:00Z"),
        ev("d", "CHECK_OUT", "2026-05-20T17:00:00Z"),
      ],
      { date: DATE },
    );
    expect(d.workedMinutes).toBe(7 * 60);
    expect(d.breakMinutes).toBe(60);
    expect(d.status).toBe("HALF_DAY"); // < 8h with defaults
  });
});

describe("deriveDay — anomalies", () => {
  it("flags missing checkout but still records hours", () => {
    const d = deriveDay([ev("a", "CHECK_IN", "2026-05-20T09:00:00Z")], { date: DATE });
    expect(d.flags).toContain("MISSING_CHECKOUT");
    expect(d.hasOpenSession).toBe(true);
    expect(d.workedMinutes).toBe(0);
  });

  it("flags check-out without check-in but does not throw", () => {
    const d = deriveDay([ev("a", "CHECK_OUT", "2026-05-20T17:00:00Z")], { date: DATE });
    expect(d.flags).toContain("CHECK_OUT_WITHOUT_CHECK_IN");
  });

  it("handles split shift (two in/out pairs)", () => {
    const d = deriveDay(
      [
        ev("a", "CHECK_IN", "2026-05-20T08:00:00Z"),
        ev("b", "CHECK_OUT", "2026-05-20T12:00:00Z"),
        ev("c", "CHECK_IN", "2026-05-20T14:00:00Z"),
        ev("d", "CHECK_OUT", "2026-05-20T18:00:00Z"),
      ],
      { date: DATE },
    );
    expect(d.workedMinutes).toBe(8 * 60);
    expect(d.status).toBe("PRESENT");
  });
});

describe("deriveDay — shift-aware late / early / overtime", () => {
  const shift = {
    startsAt: "09:00",
    endsAt: "17:00",
    graceMinutesIn: 10,
    graceMinutesOut: 0,
    overtimeAfterMinutes: 0,
    fullDayMinutes: 8 * 60,
    halfDayMinutes: 4 * 60,
  };

  it("computes lateBy past grace window", () => {
    const d = deriveDay(
      [ev("a", "CHECK_IN", "2026-05-20T09:30:00Z"), ev("b", "CHECK_OUT", "2026-05-20T17:00:00Z")],
      { date: DATE, shift },
    );
    expect(d.lateMinutes).toBe(20); // 30 min late − 10 min grace
    expect(d.flags).toContain("LATE");
  });

  it("ignores lateness within the grace window", () => {
    const d = deriveDay(
      [ev("a", "CHECK_IN", "2026-05-20T09:05:00Z"), ev("b", "CHECK_OUT", "2026-05-20T17:00:00Z")],
      { date: DATE, shift },
    );
    expect(d.lateMinutes).toBe(0);
    expect(d.flags).not.toContain("LATE");
  });

  it("computes overtime", () => {
    const d = deriveDay(
      [ev("a", "CHECK_IN", "2026-05-20T09:00:00Z"), ev("b", "CHECK_OUT", "2026-05-20T19:00:00Z")],
      { date: DATE, shift },
    );
    expect(d.overtimeMinutes).toBe(2 * 60);
    expect(d.flags).toContain("OVERTIME");
  });

  it("computes early leave", () => {
    const d = deriveDay(
      [ev("a", "CHECK_IN", "2026-05-20T09:00:00Z"), ev("b", "CHECK_OUT", "2026-05-20T16:00:00Z")],
      { date: DATE, shift },
    );
    expect(d.earlyLeaveMinutes).toBe(60);
    expect(d.flags).toContain("EARLY_LEAVE");
  });
});

describe("deriveCurrentStatus", () => {
  it("returns NOT_STARTED when no events", () => {
    const s = deriveCurrentStatus([]);
    expect(s.state).toBe("NOT_STARTED");
    expect(s.sinceAt).toBeNull();
  });

  it("tracks CHECKED_IN after a check-in", () => {
    const s = deriveCurrentStatus([ev("a", "CHECK_IN", "2026-05-20T09:00:00Z")]);
    expect(s.state).toBe("CHECKED_IN");
    expect(s.sinceAt).toEqual(new Date("2026-05-20T09:00:00Z"));
  });

  it("tracks ON_BREAK and back to CHECKED_IN", () => {
    const s = deriveCurrentStatus([
      ev("a", "CHECK_IN", "2026-05-20T09:00:00Z"),
      ev("b", "BREAK_START", "2026-05-20T12:00:00Z"),
    ]);
    expect(s.state).toBe("ON_BREAK");
    const s2 = deriveCurrentStatus([
      ev("a", "CHECK_IN", "2026-05-20T09:00:00Z"),
      ev("b", "BREAK_START", "2026-05-20T12:00:00Z"),
      ev("c", "BREAK_END", "2026-05-20T13:00:00Z"),
    ]);
    expect(s2.state).toBe("CHECKED_IN");
  });

  it("tracks CHECKED_OUT", () => {
    const s = deriveCurrentStatus([
      ev("a", "CHECK_IN", "2026-05-20T09:00:00Z"),
      ev("b", "CHECK_OUT", "2026-05-20T17:00:00Z"),
    ]);
    expect(s.state).toBe("CHECKED_OUT");
  });
});

describe("deriveRange + buildDateList", () => {
  it("derives one entry per date in the range", () => {
    const from = new Date(Date.UTC(2026, 4, 19));
    const to = new Date(Date.UTC(2026, 4, 21));
    const list = buildDateList(from, to);
    expect(list).toHaveLength(3);
    const out = deriveRange(
      [ev("a", "CHECK_IN", "2026-05-20T09:00:00Z"), ev("b", "CHECK_OUT", "2026-05-20T17:00:00Z")],
      {},
      list,
    );
    expect(out).toHaveLength(3);
    expect(out[0]!.status).toBe("ABSENT");
    expect(out[1]!.status).toBe("PRESENT");
    expect(out[2]!.status).toBe("ABSENT");
  });
});
