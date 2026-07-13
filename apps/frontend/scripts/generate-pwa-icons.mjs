// Generates the PWA icon set into public/ from an inline SVG (brand-color
// background + "RX" wordmark placeholder — swap for real brand artwork
// whenever design delivers it, same file names, no manifest changes needed).
//
// Run manually: `node scripts/generate-pwa-icons.mjs`
// Not wired into the build — icons are committed static assets so the build
// stays deterministic and doesn't depend on SVG-font rendering in CI.

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

// Brand primary-600 from src/app/globals.css (--color-primary-600).
const BRAND_BG = "#3b5bdb";
const BRAND_FG = "#ffffff";

/**
 * @param {object} opts
 * @param {number} opts.size - output square size in px
 * @param {number} opts.cornerRadius - rounded-rect radius (0 for full-bleed maskable/apple icons)
 * @param {number} opts.fontScale - font-size as a fraction of size
 */
function buildSvg({ size, cornerRadius, fontScale }) {
  const fontSize = Math.round(size * fontScale);
  const cy = size / 2;
  // Nudge baseline down slightly so the glyph optically centers.
  const baselineY = cy + fontSize * 0.34;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${cornerRadius}" ry="${cornerRadius}" fill="${BRAND_BG}"/>
  <text x="${size / 2}" y="${baselineY}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" fill="${BRAND_FG}" text-anchor="middle">RX</text>
</svg>`;
}

const targets = [
  // Standard "any" purpose icons — safe to round the corners.
  { file: "icon-192.png", size: 192, cornerRadius: 34, fontScale: 0.46 },
  { file: "icon-512.png", size: 512, cornerRadius: 92, fontScale: 0.46 },
  // Maskable: full-bleed background, glyph kept well inside the ~80% safe-zone
  // circle so OS shape masks (circle/squircle/rounded-square) never clip it.
  { file: "icon-512-maskable.png", size: 512, cornerRadius: 0, fontScale: 0.32 },
  // iOS applies its own corner mask — ship a full-bleed square, no transparency.
  { file: "apple-touch-icon.png", size: 180, cornerRadius: 0, fontScale: 0.46 },
  // Browser tab favicon.
  { file: "favicon-32x32.png", size: 32, cornerRadius: 6, fontScale: 0.5 },
];

async function main() {
  await mkdir(publicDir, { recursive: true });

  for (const target of targets) {
    const svg = buildSvg(target);
    const outPath = path.join(publicDir, target.file);
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    console.log(`wrote ${path.relative(process.cwd(), outPath)} (${target.size}x${target.size})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
