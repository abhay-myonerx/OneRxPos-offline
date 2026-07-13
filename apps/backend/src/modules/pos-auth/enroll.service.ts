// Device enrollment — binds an Electron lane (device fingerprint) to a
// tenant/store so it can later use PIN quick-login (Task 8). Queries the
// raw `prisma` client directly (not `req.db`/`createTenantClient`):
// `EnrolledDevice` is auth infrastructure, intentionally excluded from the
// per-tenant DIRECT_TENANT_MODELS scoping — see the schema.prisma comment
// above the model and `tenant-scope.test.ts` SCOPING_EXCEPTIONS.

import { prisma } from "@/config/database";
import { NotFoundError } from "@/shared/errors";

export async function getActiveEnrollment(tenantId: string, fingerprint: string) {
  return prisma.enrolledDevice.findFirst({
    where: { tenantId, fingerprint, revokedAt: null },
  });
}

export interface EnrollDeviceInput {
  tenantId: string;
  storeId: string;
  fingerprint: string;
  name?: string;
  byUserId: string;
}

/**
 * Enroll a device. Upserts on the (tenantId, fingerprint) unique so a
 * fingerprint that was previously enrolled (and possibly revoked) is
 * reactivated in place rather than producing a duplicate row.
 *
 * SECURITY — `tenantId` comes from the caller's session (trusted), but
 * `storeId` is caller-supplied in the request body. Without verifying it
 * belongs to `tenantId`, a MANAGER token from one tenant could bind an
 * enrolled device to a store id from ANOTHER tenant (cross-tenant IDOR) —
 * so the store is looked up scoped to the tenant FIRST, mirroring
 * `pin.service.ts`'s `resetPin` tenant check on its own body-supplied id.
 */
export async function enrollDevice(i: EnrollDeviceInput) {
  const store = await prisma.store.findFirst({ where: { id: i.storeId, tenantId: i.tenantId } });
  if (!store) {
    throw new NotFoundError("Store", i.storeId);
  }

  const existing = await prisma.enrolledDevice.findUnique({
    where: { tenantId_fingerprint: { tenantId: i.tenantId, fingerprint: i.fingerprint } },
  });

  if (existing) {
    return prisma.enrolledDevice.update({
      where: { id: existing.id },
      data: {
        storeId: i.storeId,
        name: i.name,
        revokedAt: null,
        enrolledByUserId: i.byUserId,
      },
    });
  }

  return prisma.enrolledDevice.create({
    data: {
      tenantId: i.tenantId,
      storeId: i.storeId,
      fingerprint: i.fingerprint,
      name: i.name,
      enrolledByUserId: i.byUserId,
    },
  });
}

/** Revoke an enrolled device. Tenant-scoped via `updateMany`'s where clause. */
export async function revokeDevice(id: string, tenantId: string): Promise<void> {
  await prisma.enrolledDevice.updateMany({
    where: { id, tenantId },
    data: { revokedAt: new Date() },
  });
}
