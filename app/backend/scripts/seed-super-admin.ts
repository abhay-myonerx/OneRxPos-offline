// src/scripts/seed-super-admin.ts
/**
 * scripts/seed-super-admin.ts
 *
 * One-time bootstrap script — creates the platform SUPER_ADMIN account.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/seed-super-admin.ts
 *
 * Environment variables used:
 *   DATABASE_URL           (required)
 *   SUPER_ADMIN_EMAIL      (required)
 *   SUPER_ADMIN_PASSWORD   (required, min 12 chars)
 *   SUPER_ADMIN_FIRST      (optional, default "Super")
 *   SUPER_ADMIN_LAST       (optional, default "Admin")
 *
 * The script is idempotent — running it twice for the same email is safe.
 */

import "dotenv/config";

import argon2 from "argon2";
import { prisma } from "../src/config/database";

const PLATFORM_TENANT_SLUG = "__platform__";

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const firstName = process.env.SUPER_ADMIN_FIRST?.trim() || "Super";
  const lastName = process.env.SUPER_ADMIN_LAST?.trim() || "Admin";

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL must be set in your environment.");
    process.exit(1);
  }

  if (!email || !password) {
    console.error(
      "❌ SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set.\n" +
        "Example:\n" +
        "SUPER_ADMIN_EMAIL=admin@platform.com " +
        "SUPER_ADMIN_PASSWORD=Str0ng!Passw0rd " +
        "npx ts-node -r tsconfig-paths/register scripts/seed-super-admin.ts",
    );
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("❌ SUPER_ADMIN_PASSWORD must be at least 12 characters.");
    process.exit(1);
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
    return;
  }

  // 3) Hash password
  const rounds = Number.parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10);

  if (!Number.isInteger(rounds) || rounds < 4) {
    console.error("❌ BCRYPT_ROUNDS must be a valid integer >= 4.");
    process.exit(1);
  }

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

  console.log("\n🎉 SUPER_ADMIN created successfully!");
  console.log("────────────────────────────────────────");
  console.log(`ID:       ${superAdmin.id}`);
  console.log(`Email:    ${superAdmin.email}`);
  console.log(`Name:     ${superAdmin.firstName} ${superAdmin.lastName}`);
  console.log(`Role:     ${superAdmin.role}`);
  console.log(`Created:  ${superAdmin.createdAt.toISOString()}`);
  console.log("────────────────────────────────────────");
  console.log("Login via POST /api/v1/auth/login");
  console.log("────────────────────────────────────────\n");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:");
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
