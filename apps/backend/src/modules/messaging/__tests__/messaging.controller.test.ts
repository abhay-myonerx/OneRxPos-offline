import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../messaging.service", () => ({
  enqueue: vi.fn(async () => ({ id: "row1", status: "QUEUED", kind: "TEST" })),
  loadTenantContext: vi.fn(async () => ({ id: "t1", encryptionKeyVersion: 1, settings: {} })),
}));
vi.mock("../outbox-drainer", () => ({
  drainMessages: vi.fn(async () => ({ sent: 1, failed: 0, skipped: 0 })),
}));

import * as controller from "../messaging.controller";
import { enqueue } from "../messaging.service";

function makeRes() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
}

// asyncHandler runs the body on a microtask and returns void, so we invoke then
// flush the queue (a macrotask drains all pending microtasks) before asserting.
async function run(handler: any, req: any, res: any) {
  const next = vi.fn();
  handler(req, res, next);
  await new Promise((r) => setImmediate(r));
  return next;
}

function makeReq(over: any = {}) {
  return {
    db: {
      messageLog: {
        findUnique: vi.fn(async () => ({ id: "row1", status: "SENT" })),
        findMany: vi.fn(async () => [{ id: "row1" }]),
        count: vi.fn(async () => 1),
        update: vi.fn(async () => ({})),
      },
    },
    user: { id: "u1", tenantId: "t1" },
    body: {},
    query: {},
    params: {},
    ...over,
  } as any;
}

beforeEach(() => vi.clearAllMocks());

describe("POST /messaging/test", () => {
  it("enqueues a TEST message to the given address and returns the row", async () => {
    const req = makeReq({ body: { to: "d@y.co" } });
    const res = makeRes();
    await run(controller.sendTest, req, res);
    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ kind: "TEST", to: { email: "d@y.co" } }),
    );
    expect(res.json).toHaveBeenCalled();
  });
});

describe("GET /messaging/log", () => {
  it("lists tenant messages", async () => {
    const req = makeReq({ query: { status: "SENT" } });
    const res = makeRes();
    await run(controller.listLog, req, res);
    expect(req.db.messageLog.findMany).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe("POST /messaging/log/:id/resend", () => {
  it("404s when the row is missing", async () => {
    const req = makeReq({ params: { id: "missing" } });
    req.db.messageLog.findUnique = vi.fn(async () => null);
    const next = await run(controller.resend, req, makeRes());
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it("re-queues an existing row and returns it", async () => {
    const req = makeReq({ params: { id: "row1" } });
    const res = makeRes();
    await run(controller.resend, req, res);
    expect(req.db.messageLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "QUEUED", attempts: 0 }) }),
    );
    expect(res.json).toHaveBeenCalled();
  });
});
