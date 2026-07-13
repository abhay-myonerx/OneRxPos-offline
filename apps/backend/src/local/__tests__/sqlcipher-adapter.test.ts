import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "../key-derivation";
import { buildSqliteAdapter } from "../sqlcipher-adapter";

const path = join(tmpdir(), `sn1-adapter-${process.pid}.db`);
const key = deriveLocalDbKey("test-master-key", "test-device");
afterEach(() => { for (const f of [path, path + "-wal", path + "-shm"]) try { rmSync(f); } catch {} });

describe("buildSqliteAdapter", () => {
  it("runs Prisma adapter IO over an encrypted file", async () => {
    const adapter = await buildSqliteAdapter({ path, key }).connect();
    await adapter.executeScript("CREATE TABLE t(id INTEGER PRIMARY KEY, name TEXT);");
    const n = await adapter.executeRaw({ sql: "INSERT INTO t(name) VALUES (?)", args: ["x"], argTypes: [{ scalarType: "string", arity: "scalar" }] });
    expect(n).toBe(1);
    const rs = await adapter.queryRaw({ sql: "SELECT name FROM t", args: [], argTypes: [] });
    expect(rs.rows[0][0]).toBe("x");
    await adapter.dispose();
    const header = readFileSync(path).subarray(0, 16).toString("latin1");
    expect(header.startsWith("SQLite format 3")).toBe(false);
  });
});
