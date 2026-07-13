// 3H.3 — auto-map spreadsheet headers to import target fields by case/space-
// insensitive synonyms. Returns header → target ("" = ignore this column).

export type ImportMode = "PRODUCTS" | "VENDOR_PRICELIST";

const PRODUCT_SYNONYMS: Record<string, string[]> = {
  name: ["name", "product name", "product", "title", "description name"],
  sku: ["sku", "code", "item code", "product code", "article"],
  barcode: ["barcode", "upc", "ean", "gtin"],
  category: ["category", "cat", "department"],
  brand: ["brand", "manufacturer", "make"],
  productType: ["type", "product type"],
  costPrice: ["cost", "cost price", "buy price", "purchase price", "unit cost"],
  sellPrice: ["price", "sell price", "sale price", "retail", "retail price", "mrp"],
  taxCategory: ["tax", "tax category"],
  description: ["description", "desc", "details"],
};

const VENDOR_SYNONYMS: Record<string, string[]> = {
  sku: ["sku", "code", "item code", "product code"],
  barcode: ["barcode", "upc", "ean", "gtin"],
  costPrice: ["cost", "cost price", "unit cost", "price"],
  supplierSku: ["supplier sku", "vendor sku", "vendor code", "supplier code", "order code"],
  leadTimeDays: ["lead time", "lead time days", "lead"],
  minOrderQty: ["moq", "min order", "min order qty", "minimum order"],
  reorderQty: ["reorder qty", "reorder", "order qty"],
};

const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, " ").trim();

export function targetFields(mode: ImportMode): string[] {
  return Object.keys(mode === "PRODUCTS" ? PRODUCT_SYNONYMS : VENDOR_SYNONYMS);
}

export function autoMapHeaders(headers: string[], mode: ImportMode): Record<string, string> {
  const syn = mode === "PRODUCTS" ? PRODUCT_SYNONYMS : VENDOR_SYNONYMS;
  const taken = new Set<string>();
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const h = norm(header);
    let matched = "";
    for (const [target, names] of Object.entries(syn)) {
      if (taken.has(target)) continue;
      if (names.some((n) => n === h)) {
        matched = target;
        break;
      }
    }
    if (matched) taken.add(matched);
    mapping[header] = matched;
  }
  return mapping;
}

/** Applies a header→target mapping to parsed rows, producing target-keyed rows. */
export function applyMapping(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): Record<string, string>[] {
  const pairs = Object.entries(mapping).filter(([, target]) => target);
  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [header, target] of pairs) if (row[header] !== undefined) out[target] = row[header];
    return out;
  });
}
