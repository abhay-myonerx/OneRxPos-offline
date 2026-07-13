// Service-level coverage for the store `province` field (Phase 1.2 Pricing
// Brain, Task 11). The store's province drives the shared tax engine's
// federal/provincial treatment at checkout (rx-pos-shared `getProvinceProfile`),
// so persisting it correctly on create/update is worth a direct test.

import { describe, it, expect, vi } from "vitest";

import * as service from "../store.service";

function makeDb(impl: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}): any {
  return {
    store: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      ...impl,
    },
  };
}

describe("store.service.createStore", () => {
  it("persists the province on create", async () => {
    const created = { id: "store-1", code: "MAIN", province: "ON" };
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(created),
    });

    await service.createStore(db, "tenant-1", {
      name: "Main St",
      code: "MAIN",
      province: "ON",
    } as never);

    expect(db.store.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ province: "ON" }),
    });
  });

  it("defaults province to null when omitted", async () => {
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "store-1", code: "MAIN" }),
    });

    await service.createStore(db, "tenant-1", { name: "Main St", code: "MAIN" } as never);

    expect(db.store.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ province: null }),
    });
  });
});

describe("store.service.updateStore", () => {
  it("passes province through to the Prisma update", async () => {
    const existing = { id: "store-1", code: "MAIN", province: null };
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(existing),
      update: vi.fn().mockResolvedValue({ ...existing, province: "BC" }),
    });

    await service.updateStore(db, "store-1", { province: "BC" } as never);

    expect(db.store.update).toHaveBeenCalledWith({
      where: { id: "store-1" },
      data: expect.objectContaining({ province: "BC" }),
    });
  });
});
