// Windows code-signing status. electron-builder signs natively when the
// standard WIN_CSC_LINK (.pfx path/URL) + WIN_CSC_KEY_PASSWORD env vars are set;
// unset means an UNSIGNED installer. Pure functions + a CLI banner so an
// unsigned release is explicit. See docs/ops/desktop-code-signing.md.

export function signingConfigured(env) {
  return Boolean(env.WIN_CSC_LINK && env.WIN_CSC_KEY_PASSWORD);
}

export function signingBanner(env) {
  return signingConfigured(env)
    ? "[sign] code-signing CONFIGURED (WIN_CSC_LINK set) — installer will be signed"
    : "[sign] code-signing NOT configured — building an UNSIGNED installer. " +
        "Set WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD to sign. See docs/ops/desktop-code-signing.md";
}

// CLI: `node scripts/signing-status.mjs` prints the banner + exits 0 (always —
// unsigned is a valid dev/CI outcome, not an error). fileURLToPath decodes the
// space-encoded module URL so the main-module check works from a path with
// spaces ("source code").
import { fileURLToPath } from "node:url";
import path from "node:path";

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  console.log(signingBanner(process.env));
}
