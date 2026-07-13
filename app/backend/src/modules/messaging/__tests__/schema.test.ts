import { describe, it, expect } from "vitest";
import { PrismaClient } from "../../../generated/prisma/client";
import { MessageStatus, MessageKind } from "../../../generated/prisma/enums";

describe("MessageLog schema", () => {
  it("exposes the messageLog delegate on the client", () => {
    const client = new PrismaClient();
    expect(typeof client.messageLog.findMany).toBe("function");
  });
  it("defines the status + kind enums", () => {
    expect(MessageStatus.QUEUED).toBe("QUEUED");
    expect(MessageStatus.SKIPPED).toBe("SKIPPED");
    expect(MessageKind.RECEIPT).toBe("RECEIPT");
    expect(MessageKind.PURCHASE_ORDER).toBe("PURCHASE_ORDER");
  });
});
