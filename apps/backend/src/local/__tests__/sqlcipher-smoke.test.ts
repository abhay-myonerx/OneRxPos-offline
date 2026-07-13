import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("sqlcipher smoke", () => {
  let dir: string;
  let file: string;
  const keyHex = "a".repeat(64); // 32-byte raw key as hex

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rxpos-smoke-"));
    file = join(dir, "s.db");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("encrypts the file and rejects a wrong key", () => {
    const db = new Database(file);
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key="x'${keyHex}'"`);
    db.exec("CREATE TABLE t (v TEXT)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run("SECRETMARKER");
    db.close();

    // raw file must not contain the plaintext marker
    const raw = readFileSync(file);
    expect(raw.includes(Buffer.from("SECRETMARKER"))).toBe(false);

    // wrong key -> reading throws
    const bad = new Database(file);
    bad.pragma("cipher='sqlcipher'");
    bad.pragma(`key="x'${"b".repeat(64)}'"`);
    expect(() => bad.prepare("SELECT count(*) FROM t").get()).toThrow();
    bad.close();

    // right key -> reads back
    const ok = new Database(file);
    ok.pragma("cipher='sqlcipher'");
    ok.pragma(`key="x'${keyHex}'"`);
    expect((ok.prepare("SELECT v FROM t").get() as { v: string }).v).toBe("SECRETMARKER");
    ok.close();
  });
});
