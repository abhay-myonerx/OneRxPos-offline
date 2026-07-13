# Database migrations

This project builds its PostgreSQL schema with Prisma's **`db push`** workflow
(schema-first), **not** `prisma migrate`. There is intentionally no
`prisma/migrations/` directory. This folder is the human-readable, ordered
record of the schema so **any developer can stand up the database from zero**
and see exactly what each phase changed.

`prisma/schema.prisma` is the **source of truth**. Everything here is generated
from or kept in sync with it.

## Fresh setup (new developer / new database)

1. Create a database and set `DATABASE_URL` in `.env`
   (e.g. `postgresql://user:pass@localhost:5432/rxpos`).
2. Apply the full schema — pick **one**:
   - **Recommended (Prisma):** `npx prisma db push`
     — creates every table/enum/index defined in `schema.prisma`.
   - **Raw SQL (no Prisma):** run `0000-baseline-schema.sql` against the DB
     (`psql "$DATABASE_URL" -f prisma/manual-migrations/0000-baseline-schema.sql`).
     It is generated from `schema.prisma` and is equivalent to `db push`.
3. Generate the client: `npm run db:generate`.
4. Seed baseline data: `npm run db:seed`
   (optional demo data: `npm run seed:demo`; a super-admin:
   `npm run db:seed:super-admin`).

That's it — a fresh database now has the **complete current schema** (all 72
tables through Phase 2.4).

## Upgrading an existing database (applied an earlier phase already)

If a database was built at an earlier phase and you only need the delta, apply
the per-phase incremental artifacts **in the order below** (each is idempotent-safe
`CREATE TABLE` / `ALTER TABLE` DDL). If you used `db push`, you do **not** need
these — `db push` reconciles the schema in one step.

| Order | File | Phase | Adds |
|------:|------|-------|------|
| 0 | `0000-baseline-schema.sql` | — | **Full schema from empty** (regenerate with the command below) |
| 1 | `2026-07-05-phase1.2-pricing-brain.sql` | 1.2 Pricing Brain | tax/levy + pricing tables |
| 2 | `2026-07-05-phase1.3a-sale-override.sql` | 1.3a Ring-up | `sale_overrides` (manager-override audit) |
| 3 | `2026-07-06-phase1.3b-parked-sale.sql` | 1.3b Suspend/Resume | `parked_sales` (park/hold + cross-till recall) |
| 4 | `2026-07-06-phase1.3c-barcode-template.sql` | 1.3c Barcode Layer 2 | `barcode_templates` (learned label templates) |
| 5 | `2026-07-06-phase1.4-cashier-shift.sql` | 1.4 Cash sale | `cash_movements` + `cashier_shifts` denomination counts |
| 6 | `2026-07-06-phase2.1-drug-identity.sql` | 2.1 Drug identity | `drug_products` (global DPD catalog) + `DrugScheduleCategory` enum + `products.din` / `products.schedule_override` |
| 7 | `2026-07-06-phase2.2-rx-link.sql` | 2.2 Rx enforcement | `rx_links` (PII-free Rx-at-till link: rx number + copay per line/DIN, sale FK CASCADE) |
| 8 | `2026-07-06-phase2.4-narcotic-event.sql` | 2.4 Narcotic log | `narcotic_events` (PII-free controlled-substance log: count reconciliation + loss/theft/destruction) |
| 9 | `2026-07-07-phase2.9.5a-device-profile.sql` | 2.9.5a Driver Panel | `device_profiles` (peripheral hardware: printer/drawer/scale/scanner, tenant+store scoped) |

The incremental files (orders 1–8) are already included in
`0000-baseline-schema.sql`; they are kept as the **per-phase change history /
audit trail** and for production change-control (apply one phase at a time).

## Regenerating the baseline

After any `schema.prisma` change, refresh the from-empty baseline so this folder
stays authoritative:

```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/manual-migrations/0000-baseline-schema.sql
```

## Adding a new phase migration

1. Edit `schema.prisma`, then `npx prisma db push` to a dev DB.
2. Capture the delta DDL as `YYYY-MM-DD-phaseX.Y-<name>.sql` in this folder
   (from the `db push` output, or a targeted `migrate diff`), and add a row to
   the table above.
3. Regenerate `0000-baseline-schema.sql` (command above) and commit both.

## Known caveat (pre-existing)

`schema.prisma` notes that uniqueness on some **nullable** columns
(`barcode`, `email`, `phone`, `variantId`) was intended to be enforced via
**partial unique indexes** (`... WHERE col IS NOT NULL`) applied in migration
SQL rather than in the schema. Those partial indexes are **not** currently
present in `schema.prisma` or in any artifact here, so neither `db push` nor the
baseline creates them. If your environment needs them, add them as an explicit
migration file and record it above.
