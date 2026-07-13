// scripts/__tests__/generate-sync-triggers.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// TDD spec for the sync-trigger DDL generator (SN-3 Task 1). Pure string-in,
// string-out — no DB connection here (the atomicity lock that actually runs
// this DDL against a live SQLCipher file lives in
// src/local/__tests__/sync-triggers.test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { buildSyncTriggers } from "../generate-sync-triggers";

describe("buildSyncTriggers", () => {
  it("emits exactly 3 CREATE TRIGGER statements for a single table", () => {
    const ddl = buildSyncTriggers([{ table: "users", pk: "id" }]);

    const createTriggerCount = (ddl.match(/CREATE TRIGGER/g) ?? []).length;
    expect(createTriggerCount).toBe(3);

    expect(ddl).toMatch(/CREATE TRIGGER\s+\S*\s+AFTER INSERT ON users\b/);
    expect(ddl).toMatch(/CREATE TRIGGER\s+\S*\s+AFTER UPDATE ON users\b/);
    expect(ddl).toMatch(/CREATE TRIGGER\s+\S*\s+AFTER DELETE ON users\b/);
  });

  it("every emitted trigger inserts into sync_outbox", () => {
    const ddl = buildSyncTriggers([{ table: "users", pk: "id" }]);
    const insertCount = (ddl.match(/INSERT INTO sync_outbox/g) ?? []).length;
    expect(insertCount).toBe(3);
  });

  it("uses NEW.<pk> for insert/update and OLD.<pk> for delete", () => {
    const ddl = buildSyncTriggers([{ table: "users", pk: "id" }]);

    const insertBlock = ddl.match(/AFTER INSERT ON users\b[\s\S]*?END;/)?.[0] ?? "";
    const updateBlock = ddl.match(/AFTER UPDATE ON users\b[\s\S]*?END;/)?.[0] ?? "";
    const deleteBlock = ddl.match(/AFTER DELETE ON users\b[\s\S]*?END;/)?.[0] ?? "";

    expect(insertBlock).toMatch(/NEW\.id/);
    expect(insertBlock).not.toMatch(/OLD\.id/);

    expect(updateBlock).toMatch(/NEW\.id/);
    expect(updateBlock).not.toMatch(/OLD\.id/);

    expect(deleteBlock).toMatch(/OLD\.id/);
    expect(deleteBlock).not.toMatch(/NEW\.id/);
  });

  it("stamps the op literal (insert/update/delete) into each trigger body", () => {
    const ddl = buildSyncTriggers([{ table: "users", pk: "id" }]);

    const insertBlock = ddl.match(/AFTER INSERT ON users\b[\s\S]*?END;/)?.[0] ?? "";
    const updateBlock = ddl.match(/AFTER UPDATE ON users\b[\s\S]*?END;/)?.[0] ?? "";
    const deleteBlock = ddl.match(/AFTER DELETE ON users\b[\s\S]*?END;/)?.[0] ?? "";

    expect(insertBlock).toMatch(/'insert'/);
    expect(updateBlock).toMatch(/'update'/);
    expect(deleteBlock).toMatch(/'delete'/);
  });

  it("stamps the table name as the entity literal", () => {
    const ddl = buildSyncTriggers([{ table: "products", pk: "id" }]);
    expect(ddl).toMatch(/'products'/);
  });

  it("N tables yields 3N triggers", () => {
    const ddl = buildSyncTriggers([
      { table: "users", pk: "id" },
      { table: "products", pk: "id" },
      { table: "sales", pk: "id" },
      { table: "sale_items", pk: "id" },
    ]);
    const createTriggerCount = (ddl.match(/CREATE TRIGGER/g) ?? []).length;
    expect(createTriggerCount).toBe(12);
  });

  it("returns an empty string for an empty table list", () => {
    expect(buildSyncTriggers([])).toBe("");
  });

  it("respects a non-'id' primary key column name", () => {
    const ddl = buildSyncTriggers([{ table: "user_pins", pk: "user_id" }]);
    expect(ddl).toMatch(/NEW\.user_id/);
    expect(ddl).toMatch(/OLD\.user_id/);
  });
});
