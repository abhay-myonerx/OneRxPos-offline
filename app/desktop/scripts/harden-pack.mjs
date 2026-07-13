// scripts/harden-pack.mjs
// electron-builder afterPack hook: AES-256-GCM-encrypt every file under
// resources/renderer, then write resources/renderer/integrity.json (sha256 of
// the CIPHERTEXT). The app:// handler decrypts on read; main verifies integrity
// at startup. Key comes from RENDERER_ENCRYPTION_KEY (64 hex). If unset, this is
// a no-op so dev packaging still works.
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function encrypt(pt, key) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(pt), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);
}
const sha = (b) => createHash("sha256").update(b).digest("hex");

function walk(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    if (n === "integrity.json") continue;
    const full = path.join(dir, n);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

export default async function afterPack(context) {
  const hex = process.env.RENDERER_ENCRYPTION_KEY;
  if (!hex) {
    console.log("[harden-pack] RENDERER_ENCRYPTION_KEY unset — skipping renderer encryption");
    return;
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("RENDERER_ENCRYPTION_KEY must be 64 hex chars");

  const rendererDir = path.join(context.appOutDir, "resources", "renderer");
  const manifest = {};
  for (const file of walk(rendererDir)) {
    const enc = encrypt(readFileSync(file), key);
    writeFileSync(file, enc);
    manifest[path.relative(rendererDir, file).split(path.sep).join("/")] = sha(enc);
  }
  writeFileSync(path.join(rendererDir, "integrity.json"), JSON.stringify(manifest));
  console.log(`[harden-pack] encrypted ${Object.keys(manifest).length} renderer files + wrote integrity.json`);
}
