import { describe, it, expect, expectTypeOf } from "vitest";
import { Prisma } from "../../../generated/prisma/client";
import type { DeviceProfile } from "../../../generated/prisma/client";

describe("DeviceProfile schema", () => {
  it("exposes the device-profile columns", () => {
    expectTypeOf<DeviceProfile>().toHaveProperty("id");
    expectTypeOf<DeviceProfile>().toHaveProperty("tenantId");
    expectTypeOf<DeviceProfile>().toHaveProperty("storeId");
    expectTypeOf<DeviceProfile>().toHaveProperty("kind");
    expectTypeOf<DeviceProfile>().toHaveProperty("label");
    expectTypeOf<DeviceProfile>().toHaveProperty("transport");
    expectTypeOf<DeviceProfile>().toHaveProperty("connection");
    expectTypeOf<DeviceProfile>().toHaveProperty("ownerStationId");
    expectTypeOf<DeviceProfile>().toHaveProperty("protocol");
    expectTypeOf<DeviceProfile>().toHaveProperty("config");
    expectTypeOf<DeviceProfile>().toHaveProperty("isActive");
    expectTypeOf<DeviceProfile>().toHaveProperty("createdAt");
    expectTypeOf<DeviceProfile>().toHaveProperty("updatedAt");
  });

  it("is registered in the generated client's scalar field enum (runtime)", () => {
    const fields = Object.values(Prisma.DeviceProfileScalarFieldEnum);
    expect(fields).toEqual(
      expect.arrayContaining([
        "id",
        "tenantId",
        "storeId",
        "kind",
        "label",
        "transport",
        "connection",
        "ownerStationId",
        "protocol",
        "config",
        "isActive",
        "createdAt",
        "updatedAt",
      ]),
    );
  });
});
