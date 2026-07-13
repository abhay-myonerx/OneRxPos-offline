import type { SectorModule } from "./types";

export interface SectorRegistry {
  register(module: SectorModule): void;
  get(id: string): SectorModule | undefined;
  has(id: string): boolean;
  all(): SectorModule[];
  clear(): void;
}

// A Map-backed registry. `all()` preserves registration order (Map iteration order).
export function createSectorRegistry(): SectorRegistry {
  const map = new Map<string, SectorModule>();
  return {
    register(module) {
      if (map.has(module.id)) {
        throw new Error(`Sector "${module.id}" is already registered`);
      }
      map.set(module.id, module);
    },
    get: (id) => map.get(id),
    has: (id) => map.has(id),
    all: () => [...map.values()],
    clear: () => map.clear(),
  };
}

// Process-global default registry used by the app; tests create isolated ones.
export const sectorRegistry: SectorRegistry = createSectorRegistry();
