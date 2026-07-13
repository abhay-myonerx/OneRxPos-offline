import { config } from "../../config";

/**
 * Provider-safe case-insensitive string-equality filter for Prisma `where`
 * clauses.
 *
 * Prisma's `mode: "insensitive"` is a **Postgres-only** feature. The SQLite
 * provider that backs the store-node desktop build rejects it outright with
 * `Invalid database query` (a 400), which is why creating a category, customer
 * group, or expense category — each of which pre-checks name uniqueness with an
 * insensitive `equals` — failed on the packaged exe.
 *
 * On Postgres we keep the original case-insensitive semantics. On SQLite we
 * fall back to a plain `equals` (case-sensitive) so the query runs; SQLite's
 * default `BINARY` collation makes this case-sensitive, which is an acceptable
 * trade-off for a uniqueness guard on a single-tenant local DB.
 */
export function ciEquals(value: string) {
  return config.DATA_BACKEND === "sqlite"
    ? { equals: value }
    : { equals: value, mode: "insensitive" as const };
}

/**
 * Provider-safe case-insensitive substring filter (the `contains` search
 * boxes use across the app). Same `mode:"insensitive"` incompatibility as
 * {@link ciEquals}: on SQLite it 400s. On SQLite we drop `mode` — Prisma emits
 * a `LIKE '%value%'`, and SQLite's default `LIKE` is already **case-insensitive
 * for ASCII**, so search keeps working; on Postgres we keep the explicit
 * insensitive mode (needed there — Postgres `LIKE` is case-sensitive).
 */
export function ciContains(value: string) {
  return config.DATA_BACKEND === "sqlite"
    ? { contains: value }
    : { contains: value, mode: "insensitive" as const };
}
