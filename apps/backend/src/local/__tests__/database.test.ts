import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "../key-derivation";
import { openLocalDb } from "../database";

describe("openLocalDb", () => {
  let dir: string;
  const key = deriveLocalDbKey("m", "d");
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "rxpos-db-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("opens keyed + WAL and round-trips; wrong key fails", () => {
    const file = join(dir, "d.db");
    const db = openLocalDb({ path: file, key });
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    db.exec("CREATE TABLE t (v TEXT)");
    db.prepare("INSERT INTO t VALUES (?)").run("hi");
    db.close();

    expect(() =>
      openLocalDb({ path: file, key: deriveLocalDbKey("m", "wrong") })
        .prepare("SELECT 1 FROM t")
        .get(),
    ).toThrow();

    const ok = openLocalDb({ path: file, key });
    expect((ok.prepare("SELECT v FROM t").get() as { v: string }).v).toBe("hi");
    ok.close();
  });
});
