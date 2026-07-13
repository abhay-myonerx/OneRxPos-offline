import type { ProvinceCode } from "rx-pos-shared";

export interface Store {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Drives the shared pricing engine's tax profile at checkout (rx-pos-shared). */
  province?: ProvinceCode | null;
  isActive: boolean;
  settings: Record<string, unknown>;
  geoLat?: string | number | null;
  geoLng?: string | number | null;
  geoRadiusM?: number | null;
  ipWhitelist?: string[];
  attendanceMethods?: string[];
  createdAt: string;
  updatedAt: string;
  _count?: { users: number; sales: number };
}

export interface StoreStats {
  users: number;
  productsInStock: number;
  todaySales: number;
  todayRevenue: string;
  lowStockItems: number;
}

export interface CreateStoreInput {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  /** Drives the shared pricing engine's tax profile at checkout (rx-pos-shared). */
  province?: ProvinceCode | null;
  settings?: Record<string, unknown>;
}

export interface UpdateStoreInput {
  name?: string;
  code?: string;
  address?: string;
  phone?: string;
  email?: string;
  province?: ProvinceCode | null;
  isActive?: boolean;
}

/** The 13 Canadian province/territory codes, for a store's province selector. */
export const PROVINCE_OPTIONS: { value: ProvinceCode; label: string }[] = [
  { value: "ON", label: "Ontario (ON)" },
  { value: "QC", label: "Quebec (QC)" },
  { value: "BC", label: "British Columbia (BC)" },
  { value: "AB", label: "Alberta (AB)" },
  { value: "MB", label: "Manitoba (MB)" },
  { value: "SK", label: "Saskatchewan (SK)" },
  { value: "NS", label: "Nova Scotia (NS)" },
  { value: "NB", label: "New Brunswick (NB)" },
  { value: "NL", label: "Newfoundland and Labrador (NL)" },
  { value: "PE", label: "Prince Edward Island (PE)" },
  { value: "NT", label: "Northwest Territories (NT)" },
  { value: "NU", label: "Nunavut (NU)" },
  { value: "YT", label: "Yukon (YT)" },
];

export interface UpdateStoreGeolocationInput {
  geoLat?: number | null;
  geoLng?: number | null;
  geoRadiusM?: number | null;
}

export type AttendanceMethod =
  "WEB" | "MANUAL" | "GEOFENCE" | "IP_RESTRICTED" | "QR_CODE" | "BIOMETRIC";

export interface UpdateStoreIpWhitelistInput {
  ipWhitelist: string[];
  attendanceMethods?: AttendanceMethod[];
}
