import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "@/local/key-derivation";
import { openLocalDb, type LocalDatabase } from "@/local/database";
import { initSchema } from "@/local/schema";
import { appendEvent } from "../event-log";
import { backoffMs, getPending, markFailed, markSynced } from "../outbox";

describe("backoffMs", () => {
  it("doubles exponentially and caps at 300000", () => {
    expect(backoffMs(0)).toBe(1000);
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(3)).toBe(8000);
    expect(backoffMs(20)).toBe(300000);
  });
});

describe("outbox helpers", () => {
  let dir: string;
  let db: LocalDatabase;
  const key = deriveLocalDbKey("m", "d");
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rxpos-outbox-"));
    db = openLocalDb({ path: join(dir, "d.db"), key });
    initSchema(db);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns a freshly appended event as pending", () => {
    const id = appendEvent(db, key, {
      entity: "sales",
      entityId: "s1",
      op: "insert",
      data: { invoiceNo: "INV-1" },
    });
    const now = Date.now();
    const pending = getPending(db, now, 10);
    expect(pending.map((r) => r.eventId)).toContain(id);
  });

  it("markFailed pushes nextAttemptAt into the future using backoff, then makes it eligible again", () => {
    const id = appendEvent(db, key, {
      entity: "sales",
      entityId: "s2",
      op: "insert",
      data: { invoiceNo: "INV-2" },
    });
    const now = Date.now();
    markFailed(db, id, "boom", now);

    const stillPending = getPending(db, now, 10);
    expect(stillPending.map((r) => r.eventId)).not.toContain(id);

    const eligibleLater = getPending(db, now + backoffMs(1), 10);
    expect(eligibleLater.map((r) => r.eventId)).toContain(id);

    const row = db
      .prepare("SELECT attempts, lastError FROM sync_outbox WHERE eventId=?")
      .get(id) as {
      attempts: number;
      lastError: string;
    };
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe("boom");
  });

  it("markSynced removes an event from the pending set", () => {
    const id = appendEvent(db, key, {
      entity: "sales",
      entityId: "s3",
      op: "insert",
      data: { invoiceNo: "INV-3" },
    });
    const now = Date.now();
    markSynced(db, [id]);
    const pending = getPending(db, now, 10);
    expect(pending.map((r) => r.eventId)).not.toContain(id);
  });
});
