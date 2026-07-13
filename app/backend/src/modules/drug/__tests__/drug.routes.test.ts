// Integration tests for the Phase 2.1 drug-identity endpoints, exercising the
// real Express app. As with the barcode/cashier-shift suites there is no live
// test-DB, so `../../../config/database` is mocked:
//   • `prisma` — a small in-memory fake of the GLOBAL `drugProduct` client
//     (catalog search / get; NOT tenant-scoped).
//   • `createTenantClient` — a fake tenant `product` client that filters by the
//     JWT's tenantId, so the tenant scoping the write endpoints rely on is
//     actually exercised. Admin gating runs through the real
//     `authorize(SETTINGS_MANAGE)` middleware against the JWT role.

import { describe, it, expect, beforeEach, vi } from "vitest";
import supertest from "supertest";

interface DrugRow {
  id: string;
  din: string;
  brandName: string;
  company: string | null;
  form: string | null;
  route: string | null;
  activeIngredients: Array<{ name: string; strength: string | null }>;
  scheduleClass: string | null;
  scheduleCategory: string;
  status: string | null;
  npn: string | null;
}

interface ProductRow {
  id: string;
  tenantId: string;
  din: string | null;
  scheduleOverride: string | null;
}

const { drugStore, productStore, prismaMock, createTenantClientMock } = vi.hoisted(() => {
  const drugStore = { rows: [] as DrugRow[] };
  const productStore = { rows: [] as ProductRow[] };

  const createTenantClientMock = vi.fn((tenantId: string) => ({
    product: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        productStore.rows.find((p) => p.id === where.id && p.tenantId === tenantId) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<ProductRow>;
      }) => {
        const p = productStore.rows.find((r) => r.id === where.id && r.tenantId === tenantId);
        if (!p) throw new Error("not found");
        Object.assign(p, data);
        return { ...p };
      },
    },
  }));

  // Global drugProduct fake (used directly by the drug controller via `prisma`).
  const prismaMock = {
    drugProduct: {
      findMany: async (args: {
        where?: { OR?: Array<Record<string, unknown>> };
        take?: number;
      }) => {
        let rows = [...drugStore.rows];
        const or = args?.where?.OR;
        if (or) {
          // Service builds OR: [{ din: { contains } }, { brandName: { contains, mode } }].
          const dinContains = (or[0]?.din as { contains?: string } | undefined)?.contains ?? "";
          const brandContains =
            (or[1]?.brandName as { contains?: string } | undefined)?.contains ?? "";
          const q = (dinContains || brandContains).toLowerCase();
          rows = rows.filter(
            (r) => r.din.toLowerCase().includes(q) || r.brandName.toLowerCase().includes(q),
          );
        }
        rows.sort((a, b) => a.brandName.localeCompare(b.brandName));
        if (args?.take) rows = rows.slice(0, args.take);
        return rows;
      },
      findUnique: async ({ where }: { where: { din: string } }) =>
        drugStore.rows.find((r) => r.din === where.din) ?? null,
    },
  };

  return { drugStore, productStore, prismaMock, createTenantClientMock };
});

vi.mock("../../../config/database", () => ({
  prisma: prismaMock,
  createTenantClient: createTenantClientMock,
}));

import app from "../../../app";
import { signAccessToken } from "../../../shared/utils/jwt";

const TENANT = "tenant-1";
const OTHER_TENANT = "tenant-2";

function token(opts: { tenantId?: string; role?: string } = {}): string {
  return signAccessToken({
    sub: "user-1",
    tenantId: opts.tenantId ?? TENANT,
    storeId: "store-1",
    storeIds: ["store-1"],
    role: opts.role ?? "ADMIN",
    email: "admin@test.io",
    firstName: "A",
    lastName: "D",
  } as never);
}

function seedDrugs() {
  drugStore.rows = [
    {
      id: "dp-1",
      din: "00654523",
      brandName: "TYLENOL WITH CODEINE NO.3",
      company: "JANSSEN INC",
      form: "TABLET",
      route: "ORAL",
      activeIngredients: [
        { name: "ACETAMINOPHEN", strength: "300 MG" },
        { name: "CODEINE PHOSPHATE", strength: "30 MG" },
      ],
      scheduleClass: "Narcotic (CDSA); Prescription",
      scheduleCategory: "NARCOTIC",
      status: "marketed",
      npn: null,
    },
    {
      id: "dp-2",
      din: "02238233",
      brandName: "LIPITOR 10MG",
      company: "PFIZER CANADA ULC",
      form: "TABLET",
      route: "ORAL",
      activeIngredients: [{ name: "ATORVASTATIN CALCIUM", strength: "10 MG" }],
      scheduleClass: "Prescription",
      scheduleCategory: "NEEDS_RX",
      status: "marketed",
      npn: null,
    },
    {
      id: "dp-3",
      din: "00559407",
      brandName: "ADVIL 200MG",
      company: "HALEON",
      form: "TABLET",
      route: "ORAL",
      activeIngredients: [{ name: "IBUPROFEN", strength: "200 MG" }],
      scheduleClass: "OTC",
      scheduleCategory: "OPEN",
      status: "marketed",
      npn: null,
    },
  ];
}

beforeEach(() => {
  seedDrugs();
  productStore.rows = [
    { id: "p1", tenantId: TENANT, din: null, scheduleOverride: null },
    { id: "p2", tenantId: OTHER_TENANT, din: null, scheduleOverride: null },
  ];
});

describe("GET /api/v1/drug-products (search)", () => {
  it("401s without auth", async () => {
    const res = await supertest(app).get("/api/v1/drug-products");
    expect(res.status).toBe(401);
  });

  it("returns the whole catalog (brand-sorted) with no search term", async () => {
    const res = await supertest(app)
      .get("/api/v1/drug-products")
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { din: string }) => d.din)).toEqual([
      "00559407", // ADVIL
      "02238233", // LIPITOR
      "00654523", // TYLENOL
    ]);
  });

  it("searches by DIN (contains)", async () => {
    const res = await supertest(app)
      .get("/api/v1/drug-products?search=006545")
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].din).toBe("00654523");
    expect(res.body.data[0].scheduleCategory).toBe("NARCOTIC");
  });

  it("searches by brand name (case-insensitive)", async () => {
    const res = await supertest(app)
      .get("/api/v1/drug-products?search=lipitor")
      .set("Authorization", `Bearer ${token()}`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].brandName).toBe("LIPITOR 10MG");
  });

  it("searches by active-ingredient name", async () => {
    const res = await supertest(app)
      .get("/api/v1/drug-products?search=ibuprofen")
      .set("Authorization", `Bearer ${token()}`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].din).toBe("00559407");
  });

  it("is readable by a non-admin cashier (global reference, auth only)", async () => {
    const res = await supertest(app)
      .get("/api/v1/drug-products?search=advil")
      .set("Authorization", `Bearer ${token({ role: "CASHIER" })}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe("GET /api/v1/drug-products/:din", () => {
  it("returns a single entry with its DTO", async () => {
    const res = await supertest(app)
      .get("/api/v1/drug-products/00559407")
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      din: "00559407",
      brandName: "ADVIL 200MG",
      scheduleCategory: "OPEN",
      activeIngredients: [{ name: "IBUPROFEN", strength: "200 MG" }],
    });
  });

  it("404s an unknown DIN", async () => {
    const res = await supertest(app)
      .get("/api/v1/drug-products/99999999")
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/v1/products/:id/drug (link / unlink)", () => {
  it("403s a non-admin cashier (admin-gated) — product untouched", async () => {
    const res = await supertest(app)
      .put("/api/v1/products/p1/drug")
      .set("Authorization", `Bearer ${token({ role: "CASHIER" })}`)
      .send({ din: "00654523" });
    expect(res.status).toBe(403);
    expect(productStore.rows.find((p) => p.id === "p1")?.din).toBeNull();
  });

  it("links a DIN for an admin", async () => {
    const res = await supertest(app)
      .put("/api/v1/products/p1/drug")
      .set("Authorization", `Bearer ${token()}`)
      .send({ din: "00654523" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: "p1", din: "00654523" });
    expect(productStore.rows.find((p) => p.id === "p1")?.din).toBe("00654523");
  });

  it("soft-links a DIN with no matching DrugProduct yet (warn-but-allow)", async () => {
    const res = await supertest(app)
      .put("/api/v1/products/p1/drug")
      .set("Authorization", `Bearer ${token()}`)
      .send({ din: "77777777" });
    expect(res.status).toBe(200);
    expect(res.body.data.din).toBe("77777777");
  });

  it("unlinks with din:null", async () => {
    await supertest(app)
      .put("/api/v1/products/p1/drug")
      .set("Authorization", `Bearer ${token()}`)
      .send({ din: "00654523" });
    const res = await supertest(app)
      .put("/api/v1/products/p1/drug")
      .set("Authorization", `Bearer ${token()}`)
      .send({ din: null });
    expect(res.status).toBe(200);
    expect(res.body.data.din).toBeNull();
  });

  it("404s linking a product that belongs to another tenant (tenant-scoped)", async () => {
    const res = await supertest(app)
      .put("/api/v1/products/p2/drug")
      .set("Authorization", `Bearer ${token()}`)
      .send({ din: "00654523" });
    expect(res.status).toBe(404);
    expect(productStore.rows.find((p) => p.id === "p2")?.din).toBeNull();
  });
});

describe("PUT /api/v1/products/:id/schedule-override", () => {
  it("403s a non-admin cashier", async () => {
    const res = await supertest(app)
      .put("/api/v1/products/p1/schedule-override")
      .set("Authorization", `Bearer ${token({ role: "CASHIER" })}`)
      .send({ scheduleOverride: "NARCOTIC" });
    expect(res.status).toBe(403);
  });

  it("sets an override for an admin", async () => {
    const res = await supertest(app)
      .put("/api/v1/products/p1/schedule-override")
      .set("Authorization", `Bearer ${token()}`)
      .send({ scheduleOverride: "NARCOTIC" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: "p1", scheduleOverride: "NARCOTIC" });
  });

  it("clears an override with null", async () => {
    const res = await supertest(app)
      .put("/api/v1/products/p1/schedule-override")
      .set("Authorization", `Bearer ${token()}`)
      .send({ scheduleOverride: null });
    expect(res.status).toBe(200);
    expect(res.body.data.scheduleOverride).toBeNull();
  });

  it("400s an invalid override enum value", async () => {
    const res = await supertest(app)
      .put("/api/v1/products/p1/schedule-override")
      .set("Authorization", `Bearer ${token()}`)
      .send({ scheduleOverride: "BOGUS" });
    expect(res.status).toBe(400);
  });
});
