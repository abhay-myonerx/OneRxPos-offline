import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../product-supplier.service", () => ({
  listVendors: vi.fn(async () => [{ supplierId: "s1", isCheapest: true, isPreferred: true }]),
  addVendor: vi.fn(async () => ({ id: "ps1", supplierId: "s1" })),
  updateVendor: vi.fn(async () => ({ id: "ps1", supplierId: "s1", costPrice: 4 })),
  removeVendor: vi.fn(async () => {}),
  setPreferred: vi.fn(async () => {}),
}));

import * as controller from "../product-supplier.controller";
import * as svc from "../product-supplier.service";

const res = () => {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
};
beforeEach(() => vi.clearAllMocks());

it("GET vendors returns the list", async () => {
  const req: any = { db: {}, params: { id: "p1" } };
  const r = res();
  await controller.listVendors(req, r, vi.fn());
  expect(svc.listVendors).toHaveBeenCalledWith({}, "p1");
  expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});

it("POST vendor adds (201) and returns it", async () => {
  const req: any = { db: {}, params: { id: "p1" }, body: { supplierId: "s1", costPrice: 3 } };
  const r = res();
  await controller.addVendor(req, r, vi.fn());
  expect(svc.addVendor).toHaveBeenCalledWith({}, "p1", { supplierId: "s1", costPrice: 3 });
  expect(r.status).toHaveBeenCalledWith(201);
});

it("prefer sets the preferred vendor", async () => {
  const req: any = { db: {}, params: { id: "p1", supplierId: "s1" } };
  const r = res();
  await controller.prefer(req, r, vi.fn());
  expect(svc.setPreferred).toHaveBeenCalledWith({}, "p1", "s1");
  expect(r.json).toHaveBeenCalledWith({ success: true });
});

it("forwards service errors to next", async () => {
  (svc.addVendor as any).mockRejectedValueOnce(Object.assign(new Error("dup"), { statusCode: 409 }));
  const req: any = { db: {}, params: { id: "p1" }, body: {} };
  const next = vi.fn();
  await controller.addVendor(req, res(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
});
