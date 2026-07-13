import type { SectorRegistry } from "./registry";
import type { SectorModule } from "./types";

// Pure: the registered modules the tenant has opted into. `enabled` is a plain
// Record so core stays decoupled from the settings module (EnabledSectors fits).
export function resolveActiveSectors(
  registry: SectorRegistry,
  enabled: Record<string, boolean>,
): SectorModule[] {
  return registry.all().filter((m) => enabled[m.id] === true);
}
