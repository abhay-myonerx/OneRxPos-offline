import { describe, it, expect, vi } from "vitest";

import { softDelete, restoreSoftDeleted, activeOnly, withArchived } from "../softDelete";

function fakeDelegate() {
  const update = vi.fn().mockResolvedValue({ ok: true });
  return { update };
}

describe("softDelete", () => {
  it("updates the record with isActive: false", async () => {
    const d = fakeDelegate();
    await softDelete(d, "id-1");
    expect(d.update).toHaveBeenCalledWith({
      where: { id: "id-1" },
      data: { isActive: false },
    });
  });
});

describe("restoreSoftDeleted", () => {
  it("updates the record with isActive: true", async () => {
    const d = fakeDelegate();
    await restoreSoftDeleted(d, "id-2");
    expect(d.update).toHaveBeenCalledWith({
      where: { id: "id-2" },
      data: { isActive: true },
    });
  });
});

describe("activeOnly", () => {
  it("adds isActive: true to an empty where", () => {
    expect(activeOnly()).toEqual({ isActive: true });
  });

  it("merges with existing where without clobbering", () => {
    expect(activeOnly({ tenantId: "t-1" })).toEqual({
      tenantId: "t-1",
      isActive: true,
    });
  });
});

describe("withArchived", () => {
  it("active → isActive: true", () => {
    expect(withArchived({ tenantId: "t-1" }, "active")).toEqual({
      tenantId: "t-1",
      isActive: true,
    });
  });

  it("archived → isActive: false", () => {
    expect(withArchived({ tenantId: "t-1" }, "archived")).toEqual({
      tenantId: "t-1",
      isActive: false,
    });
  });

  it("any → no isActive constraint", () => {
    expect(withArchived({ tenantId: "t-1" }, "any")).toEqual({
      tenantId: "t-1",
    });
  });

  it("defaults to active when state omitted", () => {
    expect(withArchived({})).toEqual({ isActive: true });
  });
});
