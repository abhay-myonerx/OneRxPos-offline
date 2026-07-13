// 3H.3 catalog import — the shared row engine. `processRow` is the SINGLE source
// of truth used by both the dry-run plan and the commit, so the preview is
// truthful. It is pure (no DB): the caller preloads a `RefCtx` via `resolveRefs`.

import type { ImportMode, ImportOptions, ImportResult, PlannedRow, RowAction } from "./import.types";
import { productRowSchema, vendorRowSchema } from "./import.validation";

export interface RefCtx {
  categoriesByName: Map<string, string>; // lowercased name → id
  brandsByName: Map<string, string>;
  productBySku: Map<string, { id: string }>; // lowercased sku → product
  productByBarcode: Map<string, { id: string }>;
  vendorLinks: Set<string>; // productIds already linked to options.supplierId
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

const lc = (v: unknown): string => String(v ?? "").trim().toLowerCase();

export async function resolveRefs(
  db: any,
  tenantId: string,
  opts: { supplierId?: string } = {},
): Promise<RefCtx> {
  const [categories, brands, products] = await Promise.all([
    db.category.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    db.brand.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    db.product.findMany({ where: { tenantId }, select: { id: true, sku: true, barcode: true } }),
  ]);
  const categoriesByName = new Map<string, string>(categories.map((c: any) => [lc(c.name), c.id]));
  const brandsByName = new Map<string, string>(brands.map((b: any) => [lc(b.name), b.id]));
  const productBySku = new Map<string, { id: string }>();
  const productByBarcode = new Map<string, { id: string }>();
  for (const p of products) {
    if (p.sku) productBySku.set(lc(p.sku), { id: p.id });
    if (p.barcode) productByBarcode.set(lc(p.barcode), { id: p.id });
  }
  let vendorLinks = new Set<string>();
  if (opts.supplierId) {
    const links = await db.productSupplier.findMany({
      where: { supplierId: opts.supplierId },
      select: { productId: true },
    });
    vendorLinks = new Set(links.map((l: any) => l.productId));
  }
  return { categoriesByName, brandsByName, productBySku, productByBarcode, vendorLinks };
}

export interface ProcessedRow {
  action: RowAction;
  messages: string[];
  data?: Record<string, unknown>;
}

export function processRow(
  ctx: RefCtx,
  row: Record<string, unknown>,
  mode: ImportMode,
  options: ImportOptions,
  seenSkus: Set<string>,
): ProcessedRow {
  return mode === "PRODUCTS"
    ? processProductRow(ctx, row, options, seenSkus)
    : processVendorRow(ctx, row, options);
}

function processProductRow(
  ctx: RefCtx,
  row: Record<string, unknown>,
  options: ImportOptions,
  seenSkus: Set<string>,
): ProcessedRow {
  const parsed = productRowSchema.safeParse(row);
  if (!parsed.success) {
    return { action: "error", messages: parsed.error.issues.map((i) => i.message) };
  }
  const r = parsed.data;
  const skuKey = lc(r.sku);

  if (seenSkus.has(skuKey)) return { action: "error", messages: [`Duplicate SKU "${r.sku}" in file`] };
  seenSkus.add(skuKey);

  const messages: string[] = [];
  const data: Record<string, unknown> = {
    name: r.name,
    sku: r.sku,
    barcode: r.barcode || null,
    productType: r.productType,
    costPrice: r.costPrice,
    sellPrice: r.sellPrice,
    description: r.description || null,
    ...(r.taxCategory ? { taxCategory: r.taxCategory } : {}),
  };

  // Category / brand by name (case-insensitive), with optional auto-create.
  if (r.category) {
    const id = ctx.categoriesByName.get(lc(r.category));
    if (id) data.categoryId = id;
    else if (options.createMissingCategories) data.newCategoryName = r.category;
    else return { action: "error", messages: [`Unknown category "${r.category}"`] };
  }
  if (r.brand) {
    const id = ctx.brandsByName.get(lc(r.brand));
    if (id) data.brandId = id;
    else if (options.createMissingBrands) data.newBrandName = r.brand;
    else return { action: "error", messages: [`Unknown brand "${r.brand}"`] };
  }

  const existing = ctx.productBySku.get(skuKey) ?? (r.barcode ? ctx.productByBarcode.get(lc(r.barcode)) : undefined);
  if (existing) {
    if (!options.updateExisting) return { action: "skip", messages: [`SKU "${r.sku}" exists — skipped`] };
    return { action: "update", messages, data: { ...data, id: existing.id } };
  }
  return { action: "create", messages, data };
}

function processVendorRow(ctx: RefCtx, row: Record<string, unknown>, options: ImportOptions): ProcessedRow {
  if (!options.supplierId) return { action: "error", messages: ["No supplier selected for the price-list"] };
  const parsed = vendorRowSchema.safeParse(row);
  if (!parsed.success) return { action: "error", messages: parsed.error.issues.map((i) => i.message) };
  const r = parsed.data;

  const product =
    (r.sku ? ctx.productBySku.get(lc(r.sku)) : undefined) ??
    (r.barcode ? ctx.productByBarcode.get(lc(r.barcode)) : undefined);
  if (!product) return { action: "error", messages: [`No product matches SKU/barcode "${r.sku ?? r.barcode}"`] };

  const data: Record<string, unknown> = {
    productId: product.id,
    supplierId: options.supplierId,
    costPrice: r.costPrice,
    supplierSku: r.supplierSku || null,
    leadTimeDays: r.leadTimeDays ?? null,
    minOrderQty: r.minOrderQty ?? null,
    reorderQty: r.reorderQty ?? null,
  };
  const linked = ctx.vendorLinks.has(product.id);
  if (linked) {
    if (!options.updateExisting) return { action: "skip", messages: ["Vendor link exists — skipped"] };
    return { action: "update", messages: [], data };
  }
  return { action: "create", messages: [], data };
}

// ── Plan (dry-run) + Commit ──────────────────────────────────────────────────

interface RanRow extends ProcessedRow {
  index: number;
}

function runRows(
  ctx: RefCtx,
  mode: ImportMode,
  rows: Record<string, unknown>[],
  options: ImportOptions,
): RanRow[] {
  const seenSkus = new Set<string>();
  return rows.map((row, index) => ({ index, ...processRow(ctx, row, mode, options, seenSkus) }));
}

function summarize(ran: RanRow[]): ImportResult["summary"] {
  const summary = { create: 0, update: 0, skip: 0, error: 0 };
  for (const r of ran) summary[r.action]++;
  return summary;
}
function toPlanned(ran: RanRow[]): PlannedRow[] {
  return ran.map((r) => ({ index: r.index, action: r.action, messages: r.messages }));
}

export async function planImport(
  db: any,
  tenantId: string,
  input: { mode: ImportMode; rows: Record<string, unknown>[]; options?: ImportOptions },
): Promise<ImportResult> {
  const options = input.options ?? {};
  const ctx = await resolveRefs(db, tenantId, { supplierId: options.supplierId });
  const ran = runRows(ctx, input.mode, input.rows, options);
  return { summary: summarize(ran), rows: toPlanned(ran) };
}

export async function commitImport(
  db: any,
  tenantId: string,
  input: { mode: ImportMode; rows: Record<string, unknown>[]; options?: ImportOptions },
): Promise<ImportResult> {
  const options = input.options ?? {};
  const ctx = await resolveRefs(db, tenantId, { supplierId: options.supplierId });
  const ran = runRows(ctx, input.mode, input.rows, options);
  const summary = summarize(ran);

  if (options.onError === "abort" && summary.error > 0) {
    return { summary, rows: toPlanned(ran), committed: false };
  }

  const writable = ran.filter((r) => r.action === "create" || r.action === "update");
  const CHUNK = 200;

  await db.$transaction(async (tx: any) => {
    // Local caches so a name created earlier in the batch isn't re-created.
    const createdCategories = new Map(ctx.categoriesByName);
    const createdBrands = new Map(ctx.brandsByName);
    const usedSlugs = new Set<string>();

    const ensureCategory = async (name: string): Promise<string> => {
      const key = name.trim().toLowerCase();
      const hit = createdCategories.get(key);
      if (hit) return hit;
      const cat = await tx.category.create({ data: { tenantId, name, slug: slugify(name) + "-" + Math.random().toString(36).slice(2, 6) } });
      createdCategories.set(key, cat.id);
      return cat.id;
    };
    const ensureBrand = async (name: string): Promise<string> => {
      const key = name.trim().toLowerCase();
      const hit = createdBrands.get(key);
      if (hit) return hit;
      const b = await tx.brand.create({ data: { tenantId, name, slug: slugify(name) + "-" + Math.random().toString(36).slice(2, 6) } });
      createdBrands.set(key, b.id);
      return b.id;
    };

    for (let i = 0; i < writable.length; i += CHUNK) {
      const chunk = writable.slice(i, i + CHUNK);
      for (const r of chunk) {
        const d = r.data as Record<string, unknown>;
        if (input.mode === "VENDOR_PRICELIST") {
          await tx.productSupplier.upsert({
            where: { productId_supplierId: { productId: d.productId, supplierId: d.supplierId } },
            create: {
              productId: d.productId, supplierId: d.supplierId, costPrice: d.costPrice,
              supplierSku: d.supplierSku ?? null, leadTimeDays: d.leadTimeDays ?? null,
              minOrderQty: d.minOrderQty ?? null, reorderQty: d.reorderQty ?? null,
            },
            update: {
              costPrice: d.costPrice, supplierSku: d.supplierSku ?? null,
              leadTimeDays: d.leadTimeDays ?? null, minOrderQty: d.minOrderQty ?? null, reorderQty: d.reorderQty ?? null,
            },
          });
          continue;
        }
        // PRODUCTS
        let categoryId = (d.categoryId as string | undefined) ?? null;
        if (!categoryId && d.newCategoryName) categoryId = await ensureCategory(d.newCategoryName as string);
        let brandId = (d.brandId as string | undefined) ?? null;
        if (!brandId && d.newBrandName) brandId = await ensureBrand(d.newBrandName as string);

        if (r.action === "update") {
          await tx.product.update({
            where: { id: d.id },
            data: {
              name: d.name, barcode: d.barcode ?? null, productType: d.productType,
              costPrice: d.costPrice, sellPrice: d.sellPrice, description: d.description ?? null,
              ...(categoryId ? { categoryId } : {}), ...(brandId ? { brandId } : {}),
              ...(d.taxCategory ? { taxCategory: d.taxCategory } : {}),
            },
          });
        } else {
          let slug = slugify(d.name as string);
          if (usedSlugs.has(slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
          usedSlugs.add(slug);
          await tx.product.create({
            data: {
              tenantId, name: d.name, slug, sku: d.sku, barcode: d.barcode ?? null,
              categoryId, brandId, productType: d.productType, costPrice: d.costPrice, sellPrice: d.sellPrice,
              description: d.description ?? null, ...(d.taxCategory ? { taxCategory: d.taxCategory } : {}),
            },
          });
        }
      }
    }
  });

  return { summary, rows: toPlanned(ran), committed: true };
}
