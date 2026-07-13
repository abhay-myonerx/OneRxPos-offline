import { describe, it, expect } from "vitest";
import { PrismaClient } from "../../../generated/prisma/client";

describe("ProductSupplier schema", () => {
  it("exposes the productSupplier delegate", () => {
    const c = new PrismaClient();
    expect(typeof c.productSupplier.findMany).toBe("function");
  });
});
