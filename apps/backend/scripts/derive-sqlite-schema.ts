// scripts/derive-sqlite-schema.ts
// ─────────────────────────────────────────────────────────────────────────────
// Derives `prisma/schema.sqlite.prisma` from `prisma/schema.prisma` (Postgres).
//
// This is a repeatable, tested transform — NOT a hand-maintained file. Do not
// hand-edit `prisma/schema.sqlite.prisma`; regenerate it by re-running this
// script (`npx tsx scripts/derive-sqlite-schema.ts`) after any change to the
// Postgres schema, and add a failing test case in
// `scripts/__tests__/derive-sqlite-schema.test.ts` before extending the rules.
//
// Rules applied, in order:
//  1. Collect every `enum <Name> { ... }` block name, then delete the blocks
//     (SQLite has no native enum type).
//  2. Rewrite the `datasource` block to `provider = "sqlite"` and
//     `url = env("SQLITE_DATABASE_URL")`.
//  3. Redirect the generator `output` from `../src/generated/prisma` to
//     `../src/generated/prisma-sqlite`.
//  4. Strip every `@db.<Type>` / `@db.<Type>(...)` native-attribute (Postgres
//     column-type hints — SQLite has no equivalent). The field's Prisma
//     scalar type is left untouched — in particular `Decimal` stays
//     `Decimal` (SQLite's Prisma connector supports it; never downgrade
//     money fields to Float/Int).
//  5. Rewrite scalar-list fields (`<Type>[] @default([])` — SQLite has no
//     scalar-list column type) to `Json @default("[]")`.
//  6. Rewrite every field whose type token is a collected enum name to
//     `String` (or `String?` if nullable), and rewrite a bare-identifier
//     `@default(MEMBER)` on that same line to the quoted string default
//     `@default("MEMBER")`.
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";

/** Matches a whole top-level `enum Name { ... }` block, capturing the name. */
const ENUM_BLOCK_RE = /^enum\s+(\w+)\s*\{[^}]*\}\n?/gm;

/** Matches `provider = "postgresql"` / `url = env("DATABASE_URL")` inside `datasource db { ... }`. */
const DATASOURCE_BLOCK_RE = /(datasource\s+db\s*\{)([^}]*)(\})/;

/** Matches every `@db.<Type>` attribute, with or without a parenthesized arg list. */
const DB_ATTR_RE = /\s*@db\.\w+(\([^)]*\))?/g;

/** Matches a scalar-list field with an empty-array default, e.g. `String[] @default([])`. */
const SCALAR_LIST_DEFAULT_RE = /(\w+)\[\](\s+)(@default\(\[\]\))/g;

/** Matches a field declaration line: indent, field name, whitespace, type token, optional `?`, rest of line. */
const FIELD_LINE_RE = /^(\s+)(\w+)(\s+)(\w+)(\??)((?:\s.*)?)$/;

/** Matches a bare-identifier default value, e.g. `@default(CASHIER)` (not a function call like `uuid()`). */
const BARE_DEFAULT_RE = /@default\(([A-Za-z_]\w*)\)/;

function collectEnumNames(src: string): Set<string> {
  const names = new Set<string>();
  for (const match of src.matchAll(ENUM_BLOCK_RE)) {
    names.add(match[1]);
  }
  return names;
}

function dropEnumBlocks(src: string): string {
  return src.replace(ENUM_BLOCK_RE, "");
}

function rewriteDatasource(src: string): string {
  return src.replace(DATASOURCE_BLOCK_RE, (_full, open: string, _body: string, close: string) => {
    return `${open}\n  provider = "sqlite"\n  url      = env("SQLITE_DATABASE_URL")\n${close}`;
  });
}

function rewriteGeneratorOutput(src: string): string {
  return src.replace(
    /output(\s*=\s*)"\.\.\/src\/generated\/prisma"/,
    'output$1"../src/generated/prisma-sqlite"',
  );
}

function stripDbAttributes(src: string): string {
  return src.replace(DB_ATTR_RE, "");
}

function rewriteScalarLists(src: string): string {
  return src.replace(SCALAR_LIST_DEFAULT_RE, 'Json$2@default("[]")');
}

function rewriteEnumFields(src: string, enumNames: Set<string>): string {
  return src
    .split("\n")
    .map((line) => {
      const m = line.match(FIELD_LINE_RE);
      if (!m) return line;
      const [, indent, fieldName, gap, typeToken, optionalMark, rest] = m;
      if (!enumNames.has(typeToken)) return line;

      const rewrittenRest = rest.replace(BARE_DEFAULT_RE, '@default("$1")');
      return `${indent}${fieldName}${gap}String${optionalMark}${rewrittenRest}`;
    })
    .join("\n");
}

/**
 * Pure transform: Postgres `schema.prisma` source text → SQLite-compatible
 * schema source text. See file header for the ordered rule list.
 */
export function deriveSqliteSchema(src: string): string {
  // Normalize CRLF → LF up front. `schema.prisma` is checked out with CRLF
  // line endings on Windows (`.gitattributes` normalizes to LF only in the
  // repo itself), and JS regex `.` never matches `\r` — every line-anchored
  // rule below would silently no-op on a `\r`-terminated line otherwise.
  const normalized = src.replace(/\r\n/g, "\n");
  const enumNames = collectEnumNames(normalized);

  let out = normalized;
  out = dropEnumBlocks(out);
  out = rewriteDatasource(out);
  out = rewriteGeneratorOutput(out);
  out = stripDbAttributes(out);
  out = rewriteScalarLists(out);
  out = rewriteEnumFields(out, enumNames);

  return out;
}

function main(): void {
  const srcPath = path.join(__dirname, "..", "prisma", "schema.prisma");
  const outPath = path.join(__dirname, "..", "prisma", "schema.sqlite.prisma");

  const src = fs.readFileSync(srcPath, "utf8");
  const header =
    "// prisma/schema.sqlite.prisma\n" +
    "// ============================================================================\n" +
    "// GENERATED FILE — DO NOT HAND-EDIT.\n" +
    "// Derived from prisma/schema.prisma by scripts/derive-sqlite-schema.ts.\n" +
    "// Regenerate with: npx tsx scripts/derive-sqlite-schema.ts\n" +
    "// ============================================================================\n\n";
  const out = header + deriveSqliteSchema(src);

  fs.writeFileSync(outPath, out, "utf8");
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outPath} (${out.length} bytes)`);
}

if (require.main === module) {
  main();
}
