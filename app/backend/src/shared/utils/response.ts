import type { Response } from "express";

/**
 * Standard success envelope used by RX POS v2 endpoints.
 *
 * v1 controllers inline `res.json({ success: true, data })` directly.
 * New v2 endpoints SHOULD use these helpers so response shapes stay
 * consistent across modules. Error responses are produced by
 * `errorHandler` middleware and follow the same envelope.
 */

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
}

export function sendSuccess<T>(res: Response, data: T, status = 200): Response {
  const body: SuccessResponse<T> = { success: true, data };
  return res.status(status).json(body);
}

export function sendCreated<T>(res: Response, data: T): Response {
  return sendSuccess(res, data, 201);
}

export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
  status = 200,
): Response {
  const body: PaginatedResponse<T> = { success: true, data, pagination };
  return res.status(status).json(body);
}
