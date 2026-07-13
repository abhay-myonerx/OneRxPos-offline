// Post-build step: copy Prisma's native query-engine binaries into `dist/`.
//
// `prisma generate` emits each generated client into `src/generated/<name>/`,
// including a platform-native query engine binary (`query_engine-windows.dll.
// node` on Windows). The build (`tsc && tsc-alias`) compiles the generated
// *.ts to `dist/generated/<name>/*.js`, but tsc only ever emits from
// TypeScript sources — it silently ignores the `.node` binary sitting beside
// them. So `dist/generated/<name>/` ends up with the client JS but WITHOUT its
// engine, and at runtime Prisma throws
// "could not locate the Query Engine for runtime windows".
//
// On a dev machine this is masked: Prisma also searches the absolute
// `src/generated/<name>/` path baked into the generated client, which exists
// locally — so `dist/`-based and packaged runs appear to work here while
// failing on every other machine (the packaged app has no `src/generated`).
// This script closes that gap by mirroring every `*.node` from
// `src/generated/**` into the matching `dist/generated/**`.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcGenerated = path.join(backendDir, "src", "generated");
const distGenerated = path.join(backendDir, "dist", "generated");

if (!existsSync(srcGenerated)) {
  console.error(`copy-prisma-engines: ${srcGenerated} not found — did \`prisma generate\` run?`);
  process.exit(1);
}

let copied = 0;
for (const name of readdirSync(srcGenerated)) {
  const srcDir = path.join(srcGenerated, name);
  if (!statSync(srcDir).isDirectory()) continue;
  for (const file of readdirSync(srcDir)) {
    if (!file.endsWith(".node")) continue;
    const from = path.join(srcDir, file);
    const toDir = path.join(distGenerated, name);
    const to = path.join(toDir, file);
    mkdirSync(toDir, { recursive: true });
    copyFileSync(from, to);
    copied += 1;
    console.log(`copy-prisma-engines: ${path.relative(backendDir, from)} -> ${path.relative(backendDir, to)}`);
  }
}

if (copied === 0) {
  console.error(
    "copy-prisma-engines: no *.node engine binaries found under src/generated/** — " +
      "the packaged app will fail with 'could not locate the Query Engine'. Did `prisma generate` run?",
  );
  process.exit(1);
}
console.log(`copy-prisma-engines: copied ${copied} engine binary/binaries into dist/generated/.`);
