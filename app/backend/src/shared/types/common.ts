import { z } from "zod";

// ─── API response envelope ─────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// ─── Common filter schemas ─────────────────────────────────────────────────────

export const dateRangeSchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid("Invalid UUID"),
});

export const storeParamSchema = z.object({
  storeId: z.string().uuid("Invalid store UUID"),
});

// ─── Utility types ─────────────────────────────────────────────────────────────

/** Make specific keys of T required */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/** Strip null from all values */
export type NonNullableFields<T> = { [K in keyof T]: NonNullable<T[K]> };

/** ID + timestamps — common on every Prisma model */
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}
