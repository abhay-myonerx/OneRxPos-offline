import { expect, it, describe } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyBundleIntegrity, bundleIsEncrypted } from "../../src/security/verify-bundle";
import { buildManifest } from "../../src/security/integrity";

function bundle(withManifest: boolean, tamper = false) {
  const dir = mkdtempSync(join(tmpdir(), "rxpos-vb-"));
  writeFileSync(join(dir, "index.html"), "<h1>hi</h1>");
  if (withManifest) {
    const manifest = buildManifest([{ rel: "index.html", bytes: Buffer.from("<h1>hi</h1>") }]);
    writeFileSync(join(dir, "integrity.json"), JSON.stringify(manifest));
    if (tamper) writeFileSync(join(dir, "index.html"), "<h1>HACKED</h1>");
  }
  return dir;
}

describe("verifyBundleIntegrity", () => {
  it("ok when no manifest present (dev/unpackaged)", () => {
    const dir = bundle(false);
    try { expect(verifyBundleIntegrity(dir).ok).toBe(true); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("ok for an untampered bundle", () => {
    const dir = bundle(true);
    try { expect(verifyBundleIntegrity(dir).ok).toBe(true); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("fails for a tampered file", () => {
    const dir = bundle(true, true);
    try { expect(verifyBundleIntegrity(dir).ok).toBe(false); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("bundleIsEncrypted", () => {
  it("is true when integrity.json is present", () => {
    const dir = bundle(true);
    try { expect(bundleIsEncrypted(dir)).toBe(true); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("is false when integrity.json is absent", () => {
    const dir = bundle(false);
    try { expect(bundleIsEncrypted(dir)).toBe(false); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
