import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "../key-derivation";
import { openLocalDb, type LocalDatabase } from "../database";
import { initSchema } from "../schema";

describe("initSchema", () => {
  let dir: string;
  let db: LocalDatabase;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rxpos-schema-"));
    db = openLocalDb({ path: join(dir, "d.db"), key: deriveLocalDbKey("m", "d") });
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the core mirror + sync tables and is idempotent", () => {
    initSchema(db);
    initSchema(db); // idempotent
    const tables = new Set(
      (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
      ).map((r) => r.name),
    );
    for (const t of [
      "products",
      "product_variants",
      "tax_groups",
      "categories",
      "brands",
      "customers",
      "customer_groups",
      "store_stock",
      "sales",
      "sale_items",
      "payments",
      "cashier_shifts",
      "stores",
      "users",
      "tenants",
      "sync_events",
      "sync_outbox",
    ]) {
      expect(tables.has(t)).toBe(true);
    }
  });
});
