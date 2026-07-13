// Per-tenant SECTOR activation (pharmacy = plugin #1, Phase 2). Unlike
// `enabledModules` (defaults-OPEN, gates the v2 API surface), sectors default
// CLOSED — a tenant opts a sector IN, and only then do that sector's checkout
// steps / compliance hooks / product-attribute rules apply. Sectors are a
// different axis from API modules, so they get their own settings namespace.
import { z } from "zod";

export const SECTOR_SLUGS = ["sample", "pharmacy"] as const; // pharmacy reserved for Phase 2
export type SectorSlug = (typeof SECTOR_SLUGS)[number];

export const SECTOR: Readonly<Record<string, SectorSlug>> = {
  SAMPLE: "sample",
  PHARMACY: "pharmacy",
} as const;

// Defaults — all `false` (opt-in). A tenant explicitly toggling `true` activates it.
export const DEFAULT_ENABLED_SECTORS: Record<SectorSlug, boolean> = Object.fromEntries(
  SECTOR_SLUGS.map((s) => [s, false]),
) as Record<SectorSlug, boolean>;

// Every slug optional, defaults to false on parse. `.catchall` tolerates unknown
// slugs (forward-compat with sectors added later).
export const enabledSectorsSchema = z
  .object(
    Object.fromEntries(SECTOR_SLUGS.map((s) => [s, z.boolean().default(false)])) as Record<
      SectorSlug,
      z.ZodDefault<z.ZodBoolean>
    >,
  )
  .catchall(z.boolean())
  .transform((parsed) => {
    const out: Record<string, boolean> = { ...parsed };
    for (const s of SECTOR_SLUGS) if (out[s] === undefined) out[s] = false;
    return out as Record<SectorSlug, boolean>;
  });

export type EnabledSectors = Record<SectorSlug, boolean>;
