/**
 * CI size check, per the project brief's definition of done: "Core probe()
 * bundle is zero-dependency and under the size budget."
 *
 * What is gated: the tree-shaken cost of `import { probe } from
 * "webgpu-radar"` measured against the built dist/ artifacts — i.e. what a
 * consumer's bundler (sideEffects: false) actually ships. generateReport()
 * and the subpath entries are outside the gate but printed for visibility,
 * so a regression there is still seen in CI logs.
 *
 * esbuild here is a devDependency used by CI only — the published package
 * keeps zero runtime dependencies.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

// 5 KB gzipped budget for the core probe() bundle, per the project brief.
const CORE_BUDGET_BYTES = 5 * 1024;

function gzipSize(buffer) {
  return gzipSync(buffer, { level: 9 }).length;
}

function listBundles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listBundles(p));
    else if (name.endsWith(".js") || name.endsWith(".cjs")) out.push(p);
  }
  return out;
}

for (const bundle of listBundles("dist").sort()) {
  console.log(`  ok  ${bundle}  ${gzipSize(readFileSync(bundle))} B gzip`);
}

async function bundledGzipSize(importStatement) {
  const result = await build({
    stdin: {
      contents: importStatement,
      resolveDir: process.cwd(),
      loader: "js",
    },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    treeShaking: true,
    write: false,
    logLevel: "silent",
  });
  return gzipSize(Buffer.from(result.outputFiles[0].contents));
}

const probeOnly = await bundledGzipSize('export { probe } from "./dist/index.js";');
const fullRoot = await bundledGzipSize('export * from "./dist/index.js";');
console.log(`  ok  full root import (informational)  ${fullRoot} B gzip`);

const over = probeOnly > CORE_BUDGET_BYTES;
console.log(
  `${over ? "FAIL" : "  ok"}  CORE import { probe }  ${probeOnly} B gzip (budget ${CORE_BUDGET_BYTES} B)`,
);

if (over) {
  console.error(`\nCore probe() bundle exceeds the ${CORE_BUDGET_BYTES} B gzip budget.`);
  process.exit(1);
}
