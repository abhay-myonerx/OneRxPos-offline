"use client";

import { useGetMeQuery } from "@/features/auth/api/auth.api";

/**
 * Whether a sector plugin is enabled for the current tenant (Phase 2.1).
 * Sectors default OFF; the pharmacy UI (drug identity, and later enforcement)
 * only appears when `pharmacy` is on. Reads the enabled sectors off the same
 * `/auth/me` payload every session already fetches, tolerating either backend
 * shape (a slug->bool map or a slug list).
 */
export function useSectorEnabled(slug: string): boolean {
  const { data } = useGetMeQuery();
  if (!data) return false;
  if (data.enabledSectors && typeof data.enabledSectors === "object") {
    return data.enabledSectors[slug] === true;
  }
  if (Array.isArray(data.sectors)) return data.sectors.includes(slug);
  return false;
}

/** Convenience: is the pharmacy sector enabled for this tenant? */
export function usePharmacyEnabled(): boolean {
  return useSectorEnabled("pharmacy");
}
