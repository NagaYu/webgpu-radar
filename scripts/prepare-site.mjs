/**
 * Bundles the built library into a single self-contained ESM file for the
 * static demo site (dist/index.js imports shared chunks, so a plain copy
 * would break). Run after `pnpm build`:
 *
 *   pnpm build && node scripts/prepare-site.mjs
 *
 * site/webgpu-radar.js is generated output — gitignored, rebuilt by the
 * Pages workflow on every deploy.
 */
import { build } from "esbuild";

await build({
  stdin: {
    contents: 'export * from "./dist/index.js";',
    resolveDir: process.cwd(),
    loader: "js",
  },
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: "site/webgpu-radar.js",
  logLevel: "info",
});
