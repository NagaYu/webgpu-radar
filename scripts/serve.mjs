/**
 * Tiny zero-dependency static file server for local dev and browser tests.
 * Serves the repository root so /dist, /site, /test and /examples all
 * resolve. WebGPU needs a secure context — http://localhost qualifies.
 *
 *   node scripts/serve.mjs           # http://localhost:8787
 *   PORT=9000 node scripts/serve.mjs
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT ?? 8787);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  // normalize() collapses "..", keeping the path inside ROOT.
  let path = join(ROOT, normalize(url.pathname));
  if (!path.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
  if (!existsSync(path)) {
    res.writeHead(404).end(`not found: ${url.pathname}`);
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
  createReadStream(path).pipe(res);
}).listen(PORT, () => {
  console.log(`serving ${ROOT} at http://localhost:${PORT}`);
});
