export interface TenantSettings {
  currency: string;
  currencySymbol: string;
  currencyPosition: "before" | "after";
  decimalPlaces: number;
  timezone: string;
  dateFormat: string;
  taxEnabled: boolean;
  defaultTaxRate: number;
  lowStockThreshold: number;
  allowNegativeStock: boolean;
  enableLoyalty: boolean;
  // 3H.2 auto-reorder namespace (both default off).
  reorder?: ReorderSettings;
  // Sector plugins (Phase 2) — opt-in per tenant, default OFF. `pharmacy`
  // activates controlled-substance schedule enforcement, Rx-at-till, and the
  // narcotic register. Toggled from Settings → Pharmacy.
  enabledSectors?: EnabledSectors;
  // NOTE: receiptHeader / receiptFooter removed.
  // All receipt customization is now in ReceiptTemplate (receipt.types.ts).
  // This eliminates the dual-source-of-truth conflict.
}

export interface EnabledSectors {
  pharmacy?: boolean;
  [slug: string]: boolean | undefined;
}

export interface ReorderSettings {
  autoReorderEnabled: boolean;
  autoEmailReorder: boolean;
}

export const DEFAULT_SETTINGS: TenantSettings = {
  currency: "USD",
  currencySymbol: "$",
  currencyPosition: "before",
  decimalPlaces: 2,
  timezone: "Asia/Dhaka",
  dateFormat: "DD/MM/YYYY",
  taxEnabled: false,
  defaultTaxRate: 0,
  lowStockThreshold: 5,
  allowNegativeStock: false,
  enableLoyalty: false,
  enabledSectors: { pharmacy: false },
};
