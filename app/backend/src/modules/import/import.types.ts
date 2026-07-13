// 3H.3 catalog import — shared types.

export type ImportMode = "PRODUCTS" | "VENDOR_PRICELIST";
export type RowAction = "create" | "update" | "skip" | "error";

export interface ImportOptions {
  /** Update products/vendor rows that already exist (else matched rows are skipped). */
  updateExisting?: boolean;
  createMissingCategories?: boolean;
  createMissingBrands?: boolean;
  /** "skip" (default): bad rows are reported + skipped. "abort": any error → nothing is committed. */
  onError?: "skip" | "abort";
  /** Required for VENDOR_PRICELIST: the supplier the price-list belongs to. */
  supplierId?: string;
}

export interface PlannedRow {
  index: number;
  action: RowAction;
  messages: string[];
}

export interface ImportSummary {
  create: number;
  update: number;
  skip: number;
  error: number;
}

export interface ImportResult {
  summary: ImportSummary;
  rows: PlannedRow[];
  /** Present on a commit: false when onError:"abort" aborted the write. */
  committed?: boolean;
}
