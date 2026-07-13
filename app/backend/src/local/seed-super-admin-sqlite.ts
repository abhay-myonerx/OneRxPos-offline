// src/local/seed-super-admin-sqlite.ts
/**
 * Store-node bootstrap logic — creates the platform SUPER_ADMIN account on
 * the SQLCipher-encrypted SQLite backend (mirrors scripts/seed-super-admin.ts,
 * which does the same thing on the Postgres backend).
 *
 * Lives under src/local (tsc `rootDir`) rather than scripts/ so it can be
 * imported directly by src/local/__tests__/sqlite-push-seed.test.ts without
 * tripping TS6059 ("File is not under 'rootDir'") — scripts/ is intentionally
 * outside the compiled project (run only via `tsx`, never `tsc`/`npm run
 * build`). scripts/seed-super-admin-sqlite.ts is the CLI entrypoint that
 * wraps this module for `npm run db:seed:sqlite`.
 *
 * Uses the SAME resolved client `src/config/database.ts` exports — that
 * resolver picks the sqlite branch (buildSqliteAdapter, keyed from
 * LOCAL_DB_MASTER_KEY + SYNC_DEVICE_ID, opened at LOCAL_DB_PATH) only when
 * DATA_BACKEND=sqlite. `seedSuperAdminSqlite` REFUSES to run against any
 * other backend so it can never be accidentally pointed at the shared
 * Postgres database.
 *
 * Environment variables used:
 *   DATA_BACKEND           (required, must be "sqlite")
 *   LOCAL_DB_MASTER_KEY     (required — see src/config/database.ts)
 *   SUPER_ADMIN_EMAIL       (optional, default "admin@storenode.local")
 *   SUPER_ADMIN_PASSWORD    (optional, default "ChangeMe123!StoreNode", min 12 chars)
 *   SUPER_ADMIN_FIRST       (optional, default "Super")
 *   SUPER_ADMIN_LAST        (optional, default "Admin")
 *
 * Idempotent — running it twice for the same email is safe.
 */
import argon2 from "argon2";
import { config } from "../config";
import { prisma } from "../config/database";

const PLATFORM_TENANT_SLUG = "__platform__";
const DEFAULT_EMAIL = "admin@storenode.local";
const DEFAULT_PASSWORD = "ChangeMe123!StoreNode";

export async function seedSuperAdminSqlite() {
  if (config.DATA_BACKEND !== "sqlite") {
    throw new Error(
      `DATA_BACKEND is "${config.DATA_BACKEND}", not "sqlite". Refusing to run — ` +
        "this script only seeds the store-node encrypted SQLite file. Set DATA_BACKEND=sqlite.",
    );
  }

  const email = (process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || DEFAULT_EMAIL) as string;
  const password = process.env.SUPER_ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const firstName = process.env.SUPER_ADMIN_FIRST?.trim() || "Super";
  const lastName = process.env.SUPER_ADMIN_LAST?.trim() || "Admin";

  if (password.length < 12) {
    throw new Error("SUPER_ADMIN_PASSWORD must be at least 12 characters.");
  }

  // 1) Ensure platform tenant exists
  let platformTenant = await prisma.tenant.findFirst({
    where: { slug: PLATFORM_TENANT_SLUG },
  });

  if (!platformTenant) {
    platformTenant = await prisma.tenant.create({
      data: {
        name: "Platform",
        slug: PLATFORM_TENANT_SLUG,
        email,
        plan: "ENTERPRISE",
        status: "ACTIVE",
        settings: {},
      },
    });

    console.log(`✅ Platform tenant created (id: ${platformTenant.id})`);
  } else {
    console.log(`ℹ️ Platform tenant already exists (id: ${platformTenant.id})`);
  }

  // 2) Check if SUPER_ADMIN already exists for this platform tenant
  const existing = await prisma.user.findFirst({
    where: {
      email,
      tenantId: platformTenant.id,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
    },
  });

  if (existing) {
    console.log(
      `ℹ️ A SUPER_ADMIN with email "${email}" already exists (id: ${existing.id}). Nothing to do.`,
    );
    return existing;
  }

  // 3) Hash password
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  // 4) Create SUPER_ADMIN user
  const superAdmin = await prisma.user.create({
    data: {
      tenantId: platformTenant.id,
      email,
      passwordHash,
      firstName,
      lastName,
      role: "SUPER_ADMIN",
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      createdAt: true,
    },
  });

  console.log("\n🎉 SUPER_ADMIN created successfully (store-node sqlite)!");
  console.log("────────────────────────────────────────");
  console.log(`ID:       ${superAdmin.id}`);
  console.log(`Email:    ${superAdmin.email}`);
  console.log(`Name:     ${superAdmin.firstName} ${superAdmin.lastName}`);
  console.log(`Role:     ${superAdmin.role}`);
  console.log(`Created:  ${superAdmin.createdAt.toISOString()}`);
  console.log("────────────────────────────────────────");
  console.log("Login via POST /api/v1/auth/login");
  console.log("────────────────────────────────────────\n");

  return superAdmin;
}
