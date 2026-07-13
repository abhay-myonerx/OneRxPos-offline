// Bundle the Electron main + preload to CommonJS. Preload is bundled (not just
// transpiled) so it works under sandbox:true, which forbids require() of app files.
import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outdir: "out",
  outExtension: { ".js": ".cjs" },
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
};

await build({ ...common, entryPoints: { main: "src/main.ts" } });
await build({ ...common, entryPoints: { preload: "src/preload.ts" } });
