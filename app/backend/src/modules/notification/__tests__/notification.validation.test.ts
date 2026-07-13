import { describe, it, expect } from "vitest";

import { broadcastSchema, listQuerySchema } from "../notification.validation";

describe("broadcastSchema", () => {
  const base = { title: "Hi", body: "There" };

  it("accepts a single role target", () => {
    const r = broadcastSchema.safeParse({ ...base, roles: ["ADMIN"] });
    expect(r.success).toBe(true);
  });

  it("accepts a single store target", () => {
    const r = broadcastSchema.safeParse({
      ...base,
      storeId: "11111111-1111-4111-8111-111111111111",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a tenant-wide target", () => {
    const r = broadcastSchema.safeParse({ ...base, tenantWide: true });
    expect(r.success).toBe(true);
  });

  it("rejects when no target is supplied", () => {
    const r = broadcastSchema.safeParse(base);
    expect(r.success).toBe(false);
  });

  it("rejects when more than one target is supplied", () => {
    const r = broadcastSchema.safeParse({
      ...base,
      roles: ["ADMIN"],
      tenantWide: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown role", () => {
    const r = broadcastSchema.safeParse({ ...base, roles: ["WIZARD"] });
    expect(r.success).toBe(false);
  });

  it("defaults type to SYSTEM", () => {
    const r = broadcastSchema.parse({ ...base, tenantWide: true });
    expect(r.type).toBe("SYSTEM");
  });
});

describe("listQuerySchema", () => {
  it("coerces isRead and validates type", () => {
    const r = listQuerySchema.parse({ isRead: "true", type: "LEAVE" });
    expect(r.isRead).toBe(true);
    expect(r.type).toBe("LEAVE");
  });

  it("rejects an unknown type", () => {
    const r = listQuerySchema.safeParse({ type: "NONSENSE" });
    expect(r.success).toBe(false);
  });
});
