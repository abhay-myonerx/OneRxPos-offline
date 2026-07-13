import type { LevyMode } from "rx-pos-shared";

export interface Levy {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  mode: LevyMode;
  /** Decimal string: dollars (FLAT_*) or percent (PERCENT). */
  amount: string;
  taxable: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateLevyInput {
  code: string;
  name: string;
  mode: LevyMode;
  amount: number;
  taxable: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface UpdateLevyInput {
  code?: string;
  name?: string;
  mode?: LevyMode;
  amount?: number;
  taxable?: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface ListLeviesParams {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "name" | "code" | "amount";
  sortOrder?: "asc" | "desc";
}

export const LEVY_MODE_OPTIONS: { value: LevyMode; label: string }[] = [
  { value: "FLAT_PER_UNIT", label: "Flat — per unit" },
  { value: "FLAT_PER_LINE", label: "Flat — per line" },
  { value: "PERCENT", label: "Percent" },
];
