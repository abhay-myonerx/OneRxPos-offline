// scripts/__tests__/derive-sqlite-schema.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// TDD spec for the Postgres → SQLite Prisma schema transform. Every rule the
// transform implements must have a case here BEFORE it is implemented — see
// `scripts/derive-sqlite-schema.ts` for the corresponding rules.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { deriveSqliteSchema } from "../derive-sqlite-schema";

const SRC = `
generator client { provider = "prisma-client" output = "../src/generated/prisma" }
datasource db { provider = "postgresql" url = env("DATABASE_URL") }
enum Role { ADMIN CASHIER }
model User {
  id     String @id @default(uuid())
  name   String @db.VarChar(120)
  role   Role   @default(CASHIER)
  meta   Json?
}
`;

describe("deriveSqliteSchema", () => {
  const out = deriveSqliteSchema(SRC);

  it("switches the datasource to sqlite + file url", () => {
    expect(out).toMatch(/provider = "sqlite"/);
    expect(out).toMatch(/url\s*=\s*env\("SQLITE_DATABASE_URL"\)/);
  });

  it("redirects the generator output to prisma-sqlite", () => {
    expect(out).toMatch(/output\s*=\s*"\.\.\/src\/generated\/prisma-sqlite"/);
  });

  it("drops @db.* native type attributes", () => {
    expect(out).not.toMatch(/@db\./);
  });

  it("rewrites enum-typed fields to String and drops enum blocks", () => {
    expect(out).not.toMatch(/enum Role/);
    expect(out).toMatch(/role\s+String\s+@default\("CASHIER"\)/);
  });

  it("keeps Json fields", () => {
    expect(out).toMatch(/meta\s+Json\?/);
  });
});

// ── Additional rules discovered by scanning the real rx-pos-backend schema ──

describe("deriveSqliteSchema — nullable enum fields without a default", () => {
  const src = `
enum ProvinceCode { ON QC }
model Store {
  province ProvinceCode?
}
`;
  const out = deriveSqliteSchema(src);

  it("rewrites a nullable enum field to String? and keeps it default-free", () => {
    expect(out).toMatch(/province\s+String\?/);
    expect(out).not.toMatch(/ProvinceCode/);
  });
});

describe("deriveSqliteSchema — Decimal money fields", () => {
  const src = `
model Product {
  price Decimal @db.Decimal(10, 2)
  tax   Decimal? @db.Decimal(5, 2) @default(0)
}
`;
  const out = deriveSqliteSchema(src);

  it("strips @db.Decimal(p,s) but keeps the Decimal scalar type (never downgrade to Float/Int)", () => {
    expect(out).toMatch(/price\s+Decimal\s+/);
    expect(out).toMatch(/tax\s+Decimal\?\s+@default\(0\)/);
    expect(out).not.toMatch(/@db\.Decimal/);
    expect(out).not.toMatch(/Float/);
  });
});

describe("deriveSqliteSchema — CRLF line endings (real schema.prisma is checked out CRLF on Windows)", () => {
  // JS regex `.` does not match `\r`, so any line-anchored rule silently
  // no-ops on a CRLF-terminated line unless CRLF is normalized to LF first.
  // This reproduces the real bug found running `prisma validate` against
  // the generated schema: enum-typed fields were left un-rewritten because
  // every line in the checked-out file ends in `\r\n`.
  const src = [
    "enum TenantPlan { FREE PRO }",
    "model Tenant {",
    "  plan TenantPlan @default(FREE)",
    "}",
    "",
  ].join("\r\n");
  const out = deriveSqliteSchema(src);

  it("still rewrites the enum-typed field to String on a CRLF-terminated source", () => {
    expect(out).toMatch(/plan\s+String\s+@default\("FREE"\)/);
    expect(out).not.toMatch(/TenantPlan/);
  });
});

describe("deriveSqliteSchema — scalar-list fields (unsupported on sqlite)", () => {
  const src = `
model Store {
  ipWhitelist       String[] @default([]) @map("ip_whitelist")
  attendanceMethods String[] @default([]) @map("attendance_methods")
  users             User[]
}
`;
  const out = deriveSqliteSchema(src);

  it("rewrites String[] @default([]) scalar lists to Json @default(\"[]\")", () => {
    expect(out).toMatch(/ipWhitelist\s+Json\s+@default\("\[\]"\)/);
    expect(out).toMatch(/attendanceMethods\s+Json\s+@default\("\[\]"\)/);
  });

  it("leaves relation list fields (Model[]) untouched", () => {
    expect(out).toMatch(/users\s+User\[\]/);
  });
});
