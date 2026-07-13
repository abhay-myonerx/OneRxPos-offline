import { expect, it, describe } from "vitest";
import { buildManifest, verifyIntegrity } from "../../src/security/integrity";

const files = [
  { rel: "index.html", bytes: Buffer.from("<html>") },
  { rel: "assets/app.js", bytes: Buffer.from("console.log(1)") },
];

describe("integrity", () => {
  it("verifies unmodified files", () => {
    expect(verifyIntegrity(buildManifest(files), files).ok).toBe(true);
  });
  it("fails when one byte is flipped", () => {
    const manifest = buildManifest(files);
    const tampered = [files[0], { rel: "assets/app.js", bytes: Buffer.from("console.log(2)") }];
    const r = verifyIntegrity(manifest, tampered);
    expect(r.ok).toBe(false);
    expect(r.mismatch).toBe("assets/app.js");
  });
  it("fails when a file is missing", () => {
    const manifest = buildManifest(files);
    expect(verifyIntegrity(manifest, [files[0]]).ok).toBe(false);
  });
});
