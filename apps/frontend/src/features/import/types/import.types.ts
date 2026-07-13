// 3H.3 catalog import — frontend types (mirror the backend).

export type ImportMode = "PRODUCTS" | "VENDOR_PRICELIST";
export type RowAction = "create" | "update" | "skip" | "error";

export interface ImportOptions {
  updateExisting?: boolean;
  createMissingCategories?: boolean;
  createMissingBrands?: boolean;
  onError?: "skip" | "abort";
  supplierId?: string;
}

export interface PlannedRow {
  index: number;
  action: RowAction;
  messages: string[];
}

export interface ImportResult {
  summary: { create: number; update: number; skip: number; error: number };
  rows: PlannedRow[];
  committed?: boolean;
}

export interface ImportRequest {
  mode: ImportMode;
  rows: Record<string, string>[];
  options?: ImportOptions;
  dryRun?: boolean;
}
