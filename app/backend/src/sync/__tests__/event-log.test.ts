import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "@/local/key-derivation";
import { openLocalDb, type LocalDatabase } from "@/local/database";
import { initSchema } from "@/local/schema";
import { appendEvent, readEvent } from "../event-log";

describe("appendEvent", () => {
  let dir: string;
  let db: LocalDatabase;
  const key = deriveLocalDbKey("m", "d");
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rxpos-ev-"));
    db = openLocalDb({ path: join(dir, "d.db"), key });
    initSchema(db);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes an encrypted event + a pending outbox row and reads it back", () => {
    const id = appendEvent(db, key, {
      entity: "sales",
      entityId: "s1",
      op: "insert",
      data: { invoiceNo: "INV-1" },
      tenantId: "t1",
      storeId: "st1",
    });
    const ev = db.prepare("SELECT payload FROM sync_events WHERE id=?").get(id) as {
      payload: string;
    };
    expect(ev.payload).not.toContain("INV-1");
    const ob = db.prepare("SELECT status FROM sync_outbox WHERE eventId=?").get(id) as {
      status: string;
    };
    expect(ob.status).toBe("pending");
    expect(readEvent(db, key, id)).toEqual({
      entity: "sales",
      entityId: "s1",
      op: "insert",
      data: { invoiceNo: "INV-1" },
    });
  });
});
