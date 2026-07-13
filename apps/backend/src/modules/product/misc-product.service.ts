// Per-tenant "Miscellaneous" product (Phase 1.3a Task 9) — the open-price
// item ring-up falls back to when a cashier needs to sell something not in
// the catalogue (e.g. a custom-priced item under an OPEN_PRICE_ITEM
// override). Idempotent: first call creates it, every later call for the
// same tenant returns the same row (`sku="__MISC__"` is unique per tenant
// via the `@@unique([tenantId, sku])` constraint on `Product`).

import type { TenantPrismaClient } from "../../config/database";

const MISC_SKU = "__MISC__";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 240);
}

export async function ensureMiscProduct(
  db: TenantPrismaClient,
  tenantId: string,
): Promise<string> {
  const existing = await db.product.findFirst({ where: { tenantId, sku: MISC_SKU } });
  if (existing) {
    // Heal legacy misc products created before this was a SERVICE. A STANDARD
    // misc product is stock-tracked, so checkout's stock guard rejects any
    // open-price / Rx line rung against it ("insufficient stock: available 0")
    // because it has no store_stock row — see checkout.service's
    // `productType !== "SERVICE"` guard. SERVICE bypasses stock entirely, which
    // is the correct semantics for an inventory-less open-price item.
    if (existing.productType !== "SERVICE") {
      await db.product.update({ where: { id: existing.id }, data: { productType: "SERVICE" } });
    }
    return existing.id;
  }

  const created = await db.product.create({
    data: {
      tenantId,
      name: "Miscellaneous",
      slug: slugify("Miscellaneous"),
      sku: MISC_SKU,
      // SERVICE so open-price / Rx lines are sellable without a stock row.
      productType: "SERVICE",
      costPrice: 0,
      sellPrice: 0,
      taxCategory: "STANDARD",
      taxInclusive: false,
      isActive: true,
    },
  });
  return created.id;
}
