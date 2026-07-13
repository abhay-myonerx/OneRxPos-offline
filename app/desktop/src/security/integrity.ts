import { createHash } from "node:crypto";

export type IntegrityManifest = Record<string, string>;

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export function buildManifest(files: { rel: string; bytes: Buffer }[]): IntegrityManifest {
  const m: IntegrityManifest = {};
  for (const f of files) m[f.rel] = sha(f.bytes);
  return m;
}

export function verifyIntegrity(
  manifest: IntegrityManifest,
  files: { rel: string; bytes: Buffer }[],
): { ok: boolean; mismatch?: string } {
  const present = new Map(files.map((f) => [f.rel, f.bytes]));
  for (const rel of Object.keys(manifest)) {
    const bytes = present.get(rel);
    if (!bytes || sha(bytes) !== manifest[rel]) return { ok: false, mismatch: rel };
  }
  return { ok: true };
}
