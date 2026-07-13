// test/unit/renderer-crypto.test.ts
import { expect, it, describe } from "vitest";
import { encryptRenderer, decryptRenderer, keyFromEnv } from "../../src/security/renderer-crypto";

const key = keyFromEnv("0".repeat(64));

describe("renderer-crypto", () => {
  it("round-trips a buffer", () => {
    const pt = Buffer.from("<html>secret bundle</html>");
    expect(decryptRenderer(encryptRenderer(pt, key), key).equals(pt)).toBe(true);
  });
  it("fails to decrypt tampered ciphertext (GCM auth)", () => {
    const wire = encryptRenderer(Buffer.from("abc"), key);
    wire[wire.length - 1] ^= 0xff; // flip a tag byte
    expect(() => decryptRenderer(wire, key)).toThrow();
  });
  it("rejects a wrong-length key", () => {
    expect(() => keyFromEnv("abcd")).toThrow();
  });
});
