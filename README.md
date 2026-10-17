# webgpu-radar

## STATUS: single-device measurement complete

**The quirks database has 0 entries. That is a consequence of the schema's own
rule: no entry may be added unless the behaviour was actually reproduced, with
`verifiedDate` set to the date of reproduction. Populating it requires many
real devices, browsers and driver combinations, which single-device measurement
cannot provide. The rule is correct and is not being relaxed to fill the table.**

What this tool does well is measure the browser it is running in: adapter
limits and compute micro-benchmarks. The aggregate across
browsers you do not own is a different problem and is not solved here.

---

> Real WebGPU capability detection for browser AI — compute-shader micro-benchmarks, a community quirks database, and tiered recommendations with WASM fallback. Not just `if (navigator.gpu)`.

[![CI](https://github.com/NagaYu/webgpu-radar/actions/workflows/ci.yml/badge.svg)](https://github.com/NagaYu/webgpu-radar/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/webgpu-radar)](https://www.npmjs.com/package/webgpu-radar)
[![core size](https://img.shields.io/badge/core-%3C5KB_gzip-5eead4)](scripts/check-size.mjs)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

`if (navigator.gpu)` tells you the API *exists*. It does not tell you whether WebGPU is actually **fast, stable, or safe to use** on this browser + OS + GPU. Implementation quality still varies wildly: compute cold-start can take seconds, reported buffer limits don't always match what really allocates, and some combinations are present-but-broken in ways no feature check catches. If you're shipping in-browser AI (WebLLM, Transformers.js, image processing), the question is never "does WebGPU exist?" — it's **"should I use it for this user, right now?"**

webgpu-radar answers that question for one browser at a time: the one it is running in. [What this cannot measure](#what-this-cannot-measure) says where that stops.

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

## What this measures

Everything here is measured live, in the browser that calls `probe()`, on whatever GPU and driver that browser was given.

1. **Real capability, step by step.** Checks that `navigator.gpu` exists, that `requestAdapter()` returns an adapter, and that `requestDevice()` gives a device that isn't lost straight away. If a step fails, the result records which one and why.
2. **Adapter identity and limits.** Reads vendor and architecture from `adapter.info`, falling back to the legacy `requestAdapterInfo()`. Requests the device with the adapter's own buffer limits. In `full` mode it also checks the reported `maxStorageBufferBindingSize` against the largest buffer that actually allocates and round-trips. A reported limit is a promise, and this measures whether the promise holds.
3. **Compute micro-benchmarks on the actual device.** `quick` mode (the default) times a cold shader compile and a small matmul (GFLOPS). `full` mode adds round-trip bandwidth and the empirical max-buffer search.
4. **WASM fallback.** Detects WASM availability, SIMD and threads. SIMD is detected by validating a real SIMD module, never by UA lookup.
5. **A graded recommendation.** Sorts the result into `webgpu-full` / `webgpu-limited` / `wasm-simd` / `wasm-basic` / `unsupported` using a [documented decision tree](#how-tiers-are-decided) with named thresholds you can override, and gives `reasons` for the choice.
6. **A report of exactly that.** Produces anonymized JSON/Markdown with browser family, OS family, GPU vendor/architecture and the numbers, but no UA string and nothing fingerprint-adjacent. It's ready to paste into a [quirk report](https://github.com/NagaYu/webgpu-radar/issues/new?template=quirk-report.yml).

The quirks matcher runs on every probe, but against a database with **0 entries** (see [STATUS](#status-single-device-measurement-complete)). Today it never changes a tier.

## What this cannot measure

Anything outside the browser that calls `probe()`.

- **Driver-specific behaviour.** A driver bug shows up only if this browser happens to run on that driver *and* the bug surfaces as a failure or a slow number in the micro-benchmarks. Wrong compute results, device loss under real (not micro-benchmark) workloads and other present-but-broken behaviour that benchmarks miss were meant for the quirks database. It has 0 entries.
- **Other GPU vendors, other OSes, other browser versions.** A probe on an Apple GPU says nothing about NVIDIA on Windows. Chrome on this machine says nothing about an older Chrome, or about Safari or Firefox.
- **The aggregate.** Answering "what share of my users get `webgpu-full`?" takes measurements from devices you don't own. The library never transmits anything, so it cannot collect them, and this repository keeps no registry of shared results.
- **Cross-hardware threshold calibration.** The default thresholds come from a handful of measurements: one Apple Silicon Mac plus GPU-less CI runners (see [How tiers are decided](#how-tiers-are-decided)). They are not statistics across devices, which is why every one of them can be overridden.

The argument at the top still holds: `if (navigator.gpu)` is not enough, because an API being present doesn't make it usable. But the argument reaches only as far as the browser you're in. `probe()` replaces a presence check with a measurement *of this browser*. It does not tell you about browsers it has never run in.

## vs. the alternatives

| | `if (navigator.gpu)` | [`detect-gpu`](https://github.com/pmndrs/detect-gpu) | `webgpu-radar` |
| --- | --- | --- | --- |
| Detects API presence | ✅ | — (WebGL-based) | ✅ |
| Actually exercises the GPU | ❌ | ✅ WebGL render FPS | ✅ WebGPU compute shaders |
| WebGPU compute / buffer limits | ❌ | ❌ | ✅ |
| Known-bug (quirks) awareness | ❌ | ❌ | ⚠️ matcher only (DB: 0 entries) |
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

The quirks database [`src/quirks/db.json`](src/quirks/db.json) has **0 entries**. That's on purpose. An entry may be added only after someone has reproduced the behaviour on real hardware, with `verifiedDate` set to the day it was reproduced ([schema](src/quirks/schema.ts)), and ideally with an upstream bug link. A wrong quirk entry misclassifies real users' machines. That rule stays, so an entry can only come from a real device that shows the problem. See [CONTRIBUTING.md](CONTRIBUTING.md) for the entry schema and review bar.

## License

[MIT](LICENSE)
