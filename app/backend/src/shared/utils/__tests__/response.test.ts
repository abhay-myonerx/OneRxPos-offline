import { describe, it, expect, vi } from "vitest";
import type { Response } from "express";
import { sendSuccess, sendCreated, sendNoContent, sendPaginated } from "../response";

function mockRes() {
  const json = vi.fn().mockReturnThis();
  const send = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnThis();
  const res = { json, send, status } as unknown as Response;
  return { res, json, send, status };
}

describe("response helpers", () => {
  it("sendSuccess defaults to 200 and wraps payload in success envelope", () => {
    const { res, status, json } = mockRes();
    sendSuccess(res, { a: 1 });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ success: true, data: { a: 1 } });
  });

  it("sendCreated uses status 201", () => {
    const { res, status } = mockRes();
    sendCreated(res, { id: "x" });
    expect(status).toHaveBeenCalledWith(201);
  });

  it("sendNoContent uses status 204 with empty body", () => {
    const { res, status, send } = mockRes();
    sendNoContent(res);
    expect(status).toHaveBeenCalledWith(204);
    expect(send).toHaveBeenCalledWith();
  });

  it("sendPaginated includes pagination metadata", () => {
    const { res, json } = mockRes();
    sendPaginated(res, [1, 2], {
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
      hasMore: false,
    });
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: [1, 2],
      pagination: {
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
        hasMore: false,
      },
    });
  });
});
