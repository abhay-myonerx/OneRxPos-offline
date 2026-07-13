import path from "node:path";
import { expect, it } from "vitest";
import { readFileFromBundle, resolveRequestPath } from "../../src/config/app-protocol";
import { encryptRenderer, keyFromEnv } from "../../src/security/renderer-crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BUNDLE = path.resolve("/srv/renderer");

// The renderer is served from a fixed host (app://bundle/…) so the SPA's
// relative asset URLs resolve correctly; files are located by PATHNAME.
it("maps the entry document to index.html", () => {
  expect(resolveRequestPath(BUNDLE, "app://bundle/index.html")).toBe(
    path.join(BUNDLE, "index.html"),
  );
});
it("maps nested asset paths under the fixed host", () => {
  expect(resolveRequestPath(BUNDLE, "app://bundle/assets/x.js")).toBe(
    path.join(BUNDLE, "assets", "x.js"),
  );
});
it("rejects path traversal", () => {
  expect(resolveRequestPath(BUNDLE, "app://bundle/../secret")).toBeNull();
  expect(resolveRequestPath(BUNDLE, "app://bundle/assets/../../secret")).toBeNull();
});
it("serves index.html for the bare host root", () => {
  expect(resolveRequestPath(BUNDLE, "app://bundle/")).toBe(
    path.join(BUNDLE, "index.html"),
  );
  expect(resolveRequestPath(BUNDLE, "app://bundle")).toBe(
    path.join(BUNDLE, "index.html"),
  );
});
it("rejects backslash traversal", () => {
  expect(resolveRequestPath(BUNDLE, "app://bundle/..\\secret")).toBeNull();
});
it("rejects single-encoded traversal (%2e%2e)", () => {
  expect(resolveRequestPath(BUNDLE, "app://bundle/%2e%2e/secret")).toBeNull();
});
it("does not traverse on double-encoded dots (%252e%252e resolves to a literal filename)", () => {
  const resolved = resolveRequestPath(BUNDLE, "app://bundle/%252e%252e/secret");
  expect(resolved).not.toBeNull();
  expect((resolved as string).startsWith(BUNDLE)).toBe(true);
});

it("readFileFromBundle decrypts when a key is provided", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rxpos-enc-"));
  try {
    const key = keyFromEnv("0".repeat(64));
    writeFileSync(join(dir, "index.html"), encryptRenderer(Buffer.from("<h1>hi</h1>"), key));
    const out = await readFileFromBundle(join(dir, "index.html"), key);
    expect(out.toString()).toBe("<h1>hi</h1>");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
