// Derivation cache for the attendance summary.
//
// Per hrm-deep-dives/2.hrm-attendance.md §9.3, the derivation engine
// is pure (events + shift map + leave map → derived status). Computing
// it on every read is fine at MVP volumes; payroll runs at scale
// (~200 employees × 30 days = 6000 derivations) need a cache.
//
// This implementation:
//   - in-process Map keyed by `tenantId:employeeId:YYYY-MM-DD`
//   - LRU-ish capped at 10_000 entries (≈ 5 MB at typical payload)
//   - 15-min TTL so stale entries self-evict
//   - explicit invalidation API for callers that just wrote a punch
//
// Production swap path:
//   The exported `attendanceDerivationCache` object has a stable
//   surface (`get` / `set` / `invalidate` / `invalidateEmployee` /
//   `clear`). A future ioredis-backed implementation lives behind
//   the same surface — no callers change.

import { logger } from "../../shared/utils/logger";

interface Entry<V> {
  value: V;
  expiresAt: number;
}

const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 10_000;

class DerivationCache<V> {
  private store = new Map<string, Entry<V>>();

  private toKey(tenantId: string, employeeId: string, date: string): string {
    return `${tenantId}:${employeeId}:${date}`;
  }

  get(tenantId: string, employeeId: string, date: string): V | null {
    const key = this.toKey(tenantId, employeeId, date);
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    // Touch — re-insert to move to the tail (Map iteration order).
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(tenantId: string, employeeId: string, date: string, value: V): void {
    const key = this.toKey(tenantId, employeeId, date);
    if (this.store.size >= MAX_ENTRIES) {
      // Evict oldest (head of Map iteration).
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + TTL_MS });
  }

  /** Invalidate one (tenant, employee, date) entry. */
  invalidate(tenantId: string, employeeId: string, date: string): void {
    this.store.delete(this.toKey(tenantId, employeeId, date));
  }

  /**
   * Invalidate every cached date for a single employee.
   * Called when a leave request is approved/cancelled, when a
   * correction is approved, or when a shift schedule changes —
   * any of those changes the derivation for unknown dates so
   * we conservatively flush the whole employee.
   */
  invalidateEmployee(tenantId: string, employeeId: string): void {
    const prefix = `${tenantId}:${employeeId}:`;
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }

  /** Wipe the entire cache — test-only. */
  clear(): void {
    this.store.clear();
  }

  /** Debug — current size (test-only). */
  size(): number {
    return this.store.size;
  }
}

// Public singleton + a typed `unknown` value generic so any
// derivation shape can flow through.
export const attendanceDerivationCache = new DerivationCache<unknown>();

/**
 * Convenience: invalidate-then-emit-log for the common "we just
 * wrote a punch" path. Used by the punch service.
 */
export function invalidateForPunch(tenantId: string, employeeId: string, occurredAt: Date): void {
  const isoDay = occurredAt.toISOString().slice(0, 10);
  attendanceDerivationCache.invalidate(tenantId, employeeId, isoDay);
  logger.debug({ tenantId, employeeId, isoDay }, "attendance derivation cache invalidated");
}
