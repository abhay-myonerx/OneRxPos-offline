import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { verifyIntegrity, type IntegrityManifest } from "./integrity";

function walk(dir: string, base = dir): { rel: string; bytes: Buffer }[] {
  const out: { rel: string; bytes: Buffer }[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === "integrity.json") continue;
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push({ rel: path.relative(base, full).split(path.sep).join("/"), bytes: readFileSync(full) });
  }
  return out;
}

// No manifest => not a hardened/packaged build => allow (dev). With a manifest,
// every listed file must match its recorded ciphertext hash.
export function verifyBundleIntegrity(dir: string): { ok: boolean; mismatch?: string } {
  const manifestPath = path.join(dir, "integrity.json");
  if (!existsSync(manifestPath)) return { ok: true };
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as IntegrityManifest;
  return verifyIntegrity(manifest, walk(dir));
}

// Whether this bundle dir was produced by the afterPack hardening hook (i.e.
// the renderer may be AES-encrypted and an integrity.json manifest was
// written alongside it). Used by main.ts to fail closed when such a build
// runs without a decrypt key available at runtime.
export function bundleIsEncrypted(dir: string): boolean {
  return existsSync(path.join(dir, "integrity.json"));
}
