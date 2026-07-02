/**
 * CI size check: the core ESM bundle (dist/index.js) must stay under the
 * budget, gzipped. Zero-dependency by design — uses Node's built-in zlib.
 * Fails the build (exit 1) on regression.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// 5 KB gzipped budget for the core probe() bundle, per the project brief.
const CORE_BUDGET_BYTES = 5 * 1024;
const CORE_BUNDLE = "dist/index.js";

function gzipSize(path) {
  return gzipSync(readFileSync(path), { level: 9 }).length;
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

let failed = false;
for (const bundle of listBundles("dist").sort()) {
  const size = gzipSize(bundle);
  const isCore = bundle === CORE_BUNDLE;
  const over = isCore && size > CORE_BUDGET_BYTES;
  if (over) failed = true;
  const budget = isCore ? ` (budget ${CORE_BUDGET_BYTES} B)` : "";
  console.log(`${over ? "FAIL" : "  ok"}  ${bundle}  ${size} B gzip${budget}`);
}

if (failed) {
  console.error(`\nCore bundle exceeds the ${CORE_BUDGET_BYTES} B gzip budget.`);
  process.exit(1);
}
