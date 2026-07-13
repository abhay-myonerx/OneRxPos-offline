// PWA-1 build-output guardrail: run after every `npm run build:spa`
// (wired as the `postbuild:spa` npm lifecycle script) so the SPA build can
// never silently regress into a non-installable app.
//
// Fails (non-zero exit) unless dist/ contains:
//   - a valid manifest.webmanifest with the required installability fields
//     and the 192/512/512-maskable icon entries
//   - a generated service worker (sw.js) + its workbox runtime chunk
//   - every icon file the manifest references, actually present on disk
//
// Usage: node scripts/verify-pwa-build.mjs  (expects dist/ to already exist —
// run `npm run build:spa` first; wired automatically via postbuild:spa).

import { readFile, readdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");

const REQUIRED_ICON_SIZES = ["192x192", "512x512"];
const REQUIRED_MASKABLE_SIZE = "512x512";

const failures = [];
function fail(msg) {
  failures.push(msg);
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await fileExists(distDir))) {
    fail(`dist/ not found at ${distDir} — run "npm run build:spa" first.`);
    report();
    return;
  }

  const distFiles = await readdir(distDir);

  // --- manifest.webmanifest ---------------------------------------------
  const manifestPath = path.join(distDir, "manifest.webmanifest");
  if (!(await fileExists(manifestPath))) {
    fail("manifest.webmanifest missing from dist/.");
  } else {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (err) {
      fail(`manifest.webmanifest is not valid JSON: ${err.message}`);
    }
    if (manifest) {
      for (const field of ["name", "short_name", "start_url", "display", "theme_color"]) {
        if (!manifest[field]) fail(`manifest.webmanifest missing required field "${field}".`);
      }
      if (manifest.display !== "standalone") {
        fail(`manifest.webmanifest display must be "standalone", got "${manifest.display}".`);
      }
      const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
      for (const size of REQUIRED_ICON_SIZES) {
        const hasAny = icons.some(
          (icon) => icon.sizes === size && (!icon.purpose || icon.purpose.includes("any")),
        );
        if (!hasAny) fail(`manifest.webmanifest missing an "any"-purpose icon at ${size}.`);
      }
      const hasMaskable = icons.some(
        (icon) => icon.sizes === REQUIRED_MASKABLE_SIZE && icon.purpose?.includes("maskable"),
      );
      if (!hasMaskable) {
        fail(`manifest.webmanifest missing a maskable icon at ${REQUIRED_MASKABLE_SIZE}.`);
      }

      // Every referenced icon file must actually be emitted.
      for (const icon of icons) {
        const iconPath = path.join(distDir, icon.src.replace(/^\.\//, ""));
        if (!(await fileExists(iconPath))) {
          fail(`manifest.webmanifest references icon "${icon.src}" but it is not in dist/.`);
        }
      }
    }
  }

  // --- service worker ------------------------------------------------------
  if (!distFiles.includes("sw.js")) {
    fail('Service worker "sw.js" missing from dist/ (expected from vite-plugin-pwa).');
  }
  const hasWorkboxChunk = distFiles.some((f) => /^workbox-.*\.js$/.test(f));
  if (!hasWorkboxChunk) {
    fail("No workbox-*.js runtime chunk found in dist/ alongside sw.js.");
  }

  // --- apple / favicon assets referenced from index.html -------------------
  for (const asset of ["apple-touch-icon.png", "favicon-32x32.png"]) {
    if (!(await fileExists(path.join(distDir, asset)))) {
      fail(`"${asset}" missing from dist/ (referenced from index.html <head>).`);
    }
  }

  report();
}

function report() {
  if (failures.length > 0) {
    console.error("PWA build verification FAILED:\n");
    for (const f of failures) console.error(`  - ${f}`);
    console.error(`\n${failures.length} issue(s). See scripts/verify-pwa-build.mjs.`);
    process.exitCode = 1;
    return;
  }
  console.log(
    "PWA build verification passed: manifest.webmanifest, sw.js, workbox runtime, and all required icons are present in dist/.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
