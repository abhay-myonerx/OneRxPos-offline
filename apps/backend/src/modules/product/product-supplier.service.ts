// 3H.2 multi-vendor — vendor management + cheapest/preferred resolution.
//
// All queries use the tenant-scoped `db` (auto-scoped by the Prisma extension).
// The cheapest/preferred resolvers sort in JS on the fetched rows so they are
// deterministic and independent of DB ordering (and testable against a simple
// mock). Resolution rules:
//   • cheapest  = active row with the lowest costPrice (ties → preferred → oldest)
//   • preferred = the isPreferred active row → else cheapest → else null

import { ConflictError, NotFoundError } from "../../shared/errors";

export interface AddVendorInput {
  supplierId: string;
  costPrice: number;
  supplierSku?: string | null;
  leadTimeDays?: number | null;
  minOrderQty?: number | null;
  reorderQty?: number | null;
  isPreferred?: boolean;
  autoEmail?: boolean | null;
}

interface VendorRow {
  id: string;
  productId: string;
  supplierId: string;
  costPrice: unknown;
  isPreferred: boolean;
  isActive: boolean;
  createdAt?: unknown;
  [k: string]: unknown;
}

function activeSortedByCost(rows: VendorRow[]): VendorRow[] {
  return rows
    .filter((r) => r.isActive)
    .sort((a, b) => {
      const ca = Number(a.costPrice);
      const cb = Number(b.costPrice);
      if (ca !== cb) return ca - cb;
      if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
      return new Date(String(a.createdAt ?? 0)).getTime() - new Date(String(b.createdAt ?? 0)).getTime();
    });
}

export async function getCheapestVendor(db: any, productId: string): Promise<VendorRow | null> {
  const rows: VendorRow[] = await db.productSupplier.findMany({ where: { productId } });
  return activeSortedByCost(rows)[0] ?? null;
}

export async function getPreferredVendor(db: any, productId: string): Promise<VendorRow | null> {
  const rows: VendorRow[] = await db.productSupplier.findMany({ where: { productId } });
  const active = rows.filter((r) => r.isActive);
  const preferred = active.find((r) => r.isPreferred);
  if (preferred) return preferred;
  return activeSortedByCost(rows)[0] ?? null;
}

export async function listVendors(
  db: any,
  productId: string,
): Promise<Array<VendorRow & { isCheapest: boolean; isPreferred: boolean }>> {
  const rows: VendorRow[] = await db.productSupplier.findMany({ where: { productId } });
  const cheapest = activeSortedByCost(rows)[0];
  return rows.map((r) => ({ ...r, isCheapest: !!cheapest && r.id === cheapest.id }));
}

export async function addVendor(db: any, productId: string, input: AddVendorInput): Promise<VendorRow> {
  let created: VendorRow;
  try {
    created = await db.productSupplier.create({
      data: {
        productId,
        supplierId: input.supplierId,
        costPrice: input.costPrice,
        supplierSku: input.supplierSku ?? null,
        leadTimeDays: input.leadTimeDays ?? null,
        minOrderQty: input.minOrderQty ?? null,
        reorderQty: input.reorderQty ?? null,
        isPreferred: false, // set via setPreferred below to keep the ≤1 invariant
        autoEmail: input.autoEmail ?? null,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      throw new ConflictError("This supplier is already linked to the product");
    }
    throw err;
  }
  if (input.isPreferred) await setPreferred(db, productId, input.supplierId);
  return created;
}

export async function updateVendor(
  db: any,
  productId: string,
  supplierId: string,
  patch: Partial<AddVendorInput>,
): Promise<VendorRow> {
  const existing = await db.productSupplier.findUnique({
    where: { productId_supplierId: { productId, supplierId } },
  });
  if (!existing) throw new NotFoundError("Product vendor", supplierId);

  const { isPreferred, supplierId: _drop, ...rest } = patch;
  const updated = await db.productSupplier.update({
    where: { productId_supplierId: { productId, supplierId } },
    data: {
      ...(rest.costPrice !== undefined ? { costPrice: rest.costPrice } : {}),
      ...(rest.supplierSku !== undefined ? { supplierSku: rest.supplierSku } : {}),
      ...(rest.leadTimeDays !== undefined ? { leadTimeDays: rest.leadTimeDays } : {}),
      ...(rest.minOrderQty !== undefined ? { minOrderQty: rest.minOrderQty } : {}),
      ...(rest.reorderQty !== undefined ? { reorderQty: rest.reorderQty } : {}),
      ...(rest.autoEmail !== undefined ? { autoEmail: rest.autoEmail } : {}),
    },
  });
  if (isPreferred === true) await setPreferred(db, productId, supplierId);
  return updated;
}

export async function removeVendor(db: any, productId: string, supplierId: string): Promise<void> {
  const existing = await db.productSupplier.findUnique({
    where: { productId_supplierId: { productId, supplierId } },
  });
  if (!existing) throw new NotFoundError("Product vendor", supplierId);
  await db.productSupplier.delete({ where: { productId_supplierId: { productId, supplierId } } });
}

/** Makes exactly one vendor preferred for the product (unsets the rest). */
export async function setPreferred(db: any, productId: string, supplierId: string): Promise<void> {
  const existing = await db.productSupplier.findUnique({
    where: { productId_supplierId: { productId, supplierId } },
  });
  if (!existing) throw new NotFoundError("Product vendor", supplierId);
  await db.$transaction(async (tx: any) => {
    await tx.productSupplier.updateMany({ where: { productId }, data: { isPreferred: false } });
    await tx.productSupplier.update({
      where: { productId_supplierId: { productId, supplierId } },
      data: { isPreferred: true },
    });
  });
}
