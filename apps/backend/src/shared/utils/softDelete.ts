// v2 soft-delete helper.
//
// Schema Conventions §3 (locked decision) bans `deletedAt` columns —
// v2.0 soft delete is `isActive Boolean @default(true)` for simple
// lifecycle, or a status enum for workflow models. This helper
// formalises the "toggle isActive" pattern that exists ad-hoc across
// `user.service`, `store.service`, etc.
//
// Usage:
//
//   await softDelete(db.user, userId, { actorId, reason });
//   await restoreSoftDeleted(db.user, userId);
//   const onlyActive = activeOnly(extraWhere);
//   const includeArchived = withArchived(extraWhere, "any");
//
// Notes:
//   - The delegate is typed loosely (`Pick<…, "update">`) because each
//     Prisma model has a distinct generated type; a generic over the
//     delegate would force a stiff signature on every caller.
//   - Caller is responsible for tenant scoping. The helper does NOT
//     inject `tenantId`; pass a tenant-scoped client (`req.db`) instead.
//   - Caller is responsible for any cascading side-effects (e.g.
//     revoking refresh tokens on user deactivation). Keep those in the
//     service so they're co-located with the business rule.

// Minimal contract a Prisma delegate must satisfy for soft-delete.
interface IsActiveDelegate {
  update: (args: { where: { id: string }; data: { isActive: boolean } }) => Promise<unknown>;
}

export interface SoftDeleteOptions {
  /** Caller's user id, written into a downstream audit log if used. */
  actorId?: string;
  /** Optional free-text reason — currently unused on the model layer
   * but accepted so callers can wire it to audit later without a
   * signature change. */
  reason?: string;
}

/**
 * Deactivate a record by setting `isActive = false`.
 *
 * Returns the updated row as Prisma yields it.
 */
export async function softDelete<TDelegate extends IsActiveDelegate>(
  delegate: TDelegate,
  id: string,
  _opts: SoftDeleteOptions = {},
): Promise<unknown> {
  return delegate.update({
    where: { id },
    data: { isActive: false },
  });
}

/**
 * Re-activate a previously soft-deleted record.
 */
export async function restoreSoftDeleted<TDelegate extends IsActiveDelegate>(
  delegate: TDelegate,
  id: string,
): Promise<unknown> {
  return delegate.update({
    where: { id },
    data: { isActive: true },
  });
}

// ─── Filter helpers ────────────────────────────────────────────────────────────

export type ArchivedFilter = "active" | "archived" | "any";

/**
 * Compose a `where` clause that filters to active rows only.
 * The default for list endpoints — surface archived rows behind an
 * explicit `?archived=any` or `?isActive=false` query flag.
 */
export function activeOnly(extraWhere: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...extraWhere, isActive: true };
}

/**
 * Compose a `where` clause for the three archived-filter states.
 *
 *   - "active"   → `isActive: true`         (default for list pages)
 *   - "archived" → `isActive: false`        (admin "trash" view)
 *   - "any"      → no isActive constraint   (cross-state search)
 */
export function withArchived(
  extraWhere: Record<string, unknown> = {},
  state: ArchivedFilter = "active",
): Record<string, unknown> {
  if (state === "any") return { ...extraWhere };
  return { ...extraWhere, isActive: state === "active" };
}
