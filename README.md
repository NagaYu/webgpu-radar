# webgpu-radar

> Real WebGPU capability detection for browser AI — compute-shader micro-benchmarks, a community quirks database, and tiered recommendations with WASM fallback. Not just `if (navigator.gpu)`.

[![CI](https://github.com/NagaYu/webgpu-radar/actions/workflows/ci.yml/badge.svg)](https://github.com/NagaYu/webgpu-radar/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/webgpu-radar)](https://www.npmjs.com/package/webgpu-radar)
[![core size](https://img.shields.io/badge/core-%3C5KB_gzip-5eead4)](scripts/check-size.mjs)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

`if (navigator.gpu)` tells you the API *exists*. It does not tell you whether WebGPU is actually **fast, stable, or safe to use** on this browser + OS + GPU. Implementation quality still varies wildly: compute cold-start can take seconds, reported buffer limits don't always match what really allocates, and some combinations are present-but-broken in ways no feature check catches. If you're shipping in-browser AI (WebLLM, Transformers.js, image processing), the question is never "does WebGPU exist?" — it's **"should I use it for this user, right now?"**

**[▶ Live demo — probe your browser now](https://nagayu.github.io/webgpu-radar/)**

## Quickstart

```bash
npm install webgpu-radar
```

```js
import { probe } from "webgpu-radar";

const result = await probe(); // ~100ms: requests a real device, runs real compute shaders

switch (result.tier) {
  case "webgpu-full":     /* full on-device AI experience */ break;
  case "webgpu-limited":  /* small models, or prefer WASM  */ break;
  case "wasm-simd":       /* CPU inference, quantized      */ break;
  case "wasm-basic":
  case "unsupported":     /* hosted API / skip the feature */ break;
}

console.log(result.reasons); // human-readable "why this tier"
```

## What it does

1. **Detects real capability** — requests an adapter *and* device, reads `adapter.info`, then times a shader compile and a small matmul on the actual GPU. Opt-in `full` mode adds round-trip bandwidth and an empirical max-buffer search (the reported limit is a promise; we find what *actually* allocates and round-trips).
2. **Classifies into a tier** — `webgpu-full` / `webgpu-limited` / `wasm-simd` / `wasm-basic` / `unsupported`, via a [documented decision tree](#how-tiers-are-decided) with named, overridable thresholds.
3. **Cross-references known quirks** — a community-maintained database of verified browser/OS/GPU-specific WebGPU bugs can override the tier even when benchmarks look fine.
4. **Falls back honestly** — WASM SIMD is detected by validating a real SIMD module, never by UA lookup.
5. **Generates a shareable report** — anonymized JSON/Markdown (browser family, OS family, GPU vendor/architecture, numbers — no UA string, nothing fingerprint-adjacent) ready to paste into a [quirk report](https://github.com/NagaYu/webgpu-radar/issues/new?template=quirk-report.yml).

## vs. the alternatives

| | `if (navigator.gpu)` | [`detect-gpu`](https://github.com/pmndrs/detect-gpu) | `webgpu-radar` |
| --- | --- | --- | --- |
| Detects API presence | ✅ | — (WebGL-based) | ✅ |
| Actually exercises the GPU | ❌ | ✅ WebGL render FPS | ✅ WebGPU compute shaders |
| WebGPU compute / buffer limits | ❌ | ❌ | ✅ |
| Known-bug (quirks) awareness | ❌ | ❌ | ✅ community DB |
| WASM fallback detection | ❌ | ❌ | ✅ |
| AI-workload-oriented tiering | ❌ | ❌ (rendering tiers) | ✅ |
| Zero runtime dependencies | ✅ | ❌ (fetches benchmark data) | ✅ |

`detect-gpu` pioneered "tier a GPU in the browser" and remains a great choice for **rendering** workloads — it answers "how fast will this GPU draw?". `webgpu-radar` answers a different question: "can this browser's **WebGPU compute** stack run AI workloads?"

## API

```ts
probe(options?: ProbeOptions): Promise<ProbeResult>
```

- `options.mode` — `"quick"` (default: shader-compile + matmul, ~100–200ms) or `"full"` (adds bandwidth + max-buffer, ~1–3s).
- `options.thresholds` — override any classification threshold (see below).
- `options.benchTimeoutMs` — per-benchmark hang failsafe (default 5000).

Never rejects because of GPU behavior — failures are folded into the result. Throws only outside a browser.

```ts
generateReport(result: ProbeResult): { json: string; markdown: string }
```

The Markdown drops straight into the quirk-report issue template. Nothing is ever transmitted anywhere by the library.

**Subpath entries** (advanced): `webgpu-radar/bench` (individual benchmarks), `webgpu-radar/quirks` (matcher + schema), and dependency-free integration helpers:

```js
import { recommendWebLLMModel } from "webgpu-radar/webllm";
const rec = recommendWebLLMModel(result); // { action: "webgpu"|"hosted-api", modelId, reasons }

import { recommendTransformersDevice } from "webgpu-radar/transformers-js";
const { device, dtype } = recommendTransformersDevice(result); // → pipeline(..., { device, dtype })
```

WebLLM / Transformers.js are optional peer dependencies — the helpers only return recommendation objects.

## How tiers are decided

```
navigator.gpu missing ──────────────► WASM check
requestAdapter() null/throws ───────► WASM check
requestDevice() throws / lost ──────► WASM check
device OK:
  blocking quirk matched ───────────► webgpu-limited (benchmarks skipped)
  shader compile > 300ms ───────────► webgpu-limited
  matmul < 8 GFLOPS ────────────────► webgpu-limited
  (full mode) bandwidth < 0.5 GB/s ─► webgpu-limited
  (full mode) working buffer < 128 MiB ► webgpu-limited
  otherwise ────────────────────────► webgpu-full
WASM check:
  SIMD module validates ────────────► wasm-simd
  WASM available, no SIMD ──────────► wasm-basic
  no WASM ──────────────────────────► unsupported
```

Every threshold is a named constant with its rationale documented [next to its definition](src/tiers/classify.ts) — e.g. the 8 GFLOPS floor sits ~2× above the fastest software rasterizer we measured (SwiftShader on a fast CPU: 4.2) and ~9× below the weakest real GPU we measured (Apple integrated: 74.6). All of them are overridable via `probe({ thresholds })`. A benchmark that errors or times out on a live device downgrades to `webgpu-limited` — an API that's present but can't run a trivial shader *is* the thing this library exists to catch.

## Contribute a quirk

Got a device where the tier looks wrong, or WebGPU misbehaves in a way benchmarks miss? That's the most valuable contribution this project can receive:

1. Run the [live demo](https://nagayu.github.io/webgpu-radar/) (or `generateReport()` in your app) on the affected machine.
2. Click **Copy report** and paste it into a [quirk report issue](https://github.com/NagaYu/webgpu-radar/issues/new?template=quirk-report.yml).

The quirks database ships **empty rather than padded**: entries require verified, current evidence (ideally an upstream bug link), because a wrong quirk entry misclassifies real users' machines. See [CONTRIBUTING.md](CONTRIBUTING.md) for the entry schema and review bar.

## License

[MIT](LICENSE)
