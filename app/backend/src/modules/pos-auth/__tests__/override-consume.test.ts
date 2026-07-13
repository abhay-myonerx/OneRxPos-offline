// Unit tests for `runConsumeOverride` — the service behind
// POST /api/v2/pos/override/consume (Phase 1.3a Task 8).
//
// This endpoint lets ring-up consume + audit a manager override grant for
// PRE-checkout gated actions (void line, clear transaction) that never
// reach a persisted sale, so their audit must happen at action time.
// Mirrors `override.test.ts` (grant minting via `mintOverrideGrant`) and
// `override.routes.test.ts` (mocking `../../audit/audit.service` so we can
// assert on the SAME audit writer `runRequestOverride` already uses via
// `recordAudit` — no second audit path).

import { createHash } from "crypto";

import { describe, it, expect, vi, beforeEach } from "vitest";

const { writeAuditLogMock } = vi.hoisted(() => ({
  writeAuditLogMock: vi.fn(async () => undefined),
}));

vi.mock("../../audit/audit.service", () => ({
  writeAuditLog: writeAuditLogMock,
}));

import { runConsumeOverride } from "../override.service";
import { mintOverrideGrant } from "../override-grant";

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

const TENANT = "tenant-1";
const CASHIER = "cashier-1";

function grantFor(action: string, context: string): string {
  return mintOverrideGrant({ action, authorizerUserId: "mgr-1", contextHash: sha256(context), jti: "jti-1" });
}

describe("runConsumeOverride", () => {
  beforeEach(() => {
    writeAuditLogMock.mockClear();
  });

  it("consumes a valid grant for the given action+context, returns true, and audits POS_OVERRIDE_CONSUMED", async () => {
    const grant = grantFor("sale:void", "sale-1");

    const ok = await runConsumeOverride({
      grant,
      action: "sale:void",
      context: "sale-1",
      cashierUserId: CASHIER,
      tenantId: TENANT,
    });

    expect(ok).toBe(true);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        userId: CASHIER,
        action: "POS_OVERRIDE_CONSUMED",
        newData: expect.objectContaining({ action: "sale:void", context: "sale-1", requestedByUserId: CASHIER }),
      }),
    );
  });

  it("rejects a grant minted for a DIFFERENT context, returns false, and audits POS_OVERRIDE_CONSUME_FAILED", async () => {
    const grant = grantFor("sale:void", "sale-1");

    const ok = await runConsumeOverride({
      grant,
      action: "sale:void",
      context: "sale-2", // different context than the grant was minted for
      cashierUserId: CASHIER,
      tenantId: TENANT,
    });

    expect(ok).toBe(false);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        userId: CASHIER,
        action: "POS_OVERRIDE_CONSUME_FAILED",
        newData: expect.objectContaining({ action: "sale:void", context: "sale-2", requestedByUserId: CASHIER }),
      }),
    );
  });

  it("rejects a garbage grant, returns false, and audits POS_OVERRIDE_CONSUME_FAILED", async () => {
    const ok = await runConsumeOverride({
      grant: "not-a-real-jwt",
      action: "sale:clear",
      context: "sale-9",
      cashierUserId: CASHIER,
      tenantId: TENANT,
    });

    expect(ok).toBe(false);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, action: "POS_OVERRIDE_CONSUME_FAILED" }),
    );
  });
});
