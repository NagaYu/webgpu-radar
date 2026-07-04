/**
 * webgpu-radar — real WebGPU capability detection for browser AI.
 *
 * Root entry point. Keep this surface small: probe(), generateReport(),
 * and the public types.
 */
import { benchBufferBandwidth } from "./bench/buffer-bandwidth.js";
import { benchMatmul } from "./bench/matmul.js";
import { benchMaxBuffer } from "./bench/max-buffer.js";
import { runBench } from "./bench/runner.js";
import { benchShaderCompile } from "./bench/shader-compile.js";
import { requestAdapterAndDevice } from "./detect/adapter.js";
import { detectEnvironment, isBrowserEnvironment } from "./detect/environment.js";
import { detectWasm } from "./detect/wasm.js";
import db from "./quirks/db.json" with { type: "json" };
import { matchQuirks } from "./quirks/match.js";
import type { QuirkEntry } from "./quirks/schema.js";
import { classify } from "./tiers/classify.js";
import type { BenchmarkResults, MatchedQuirk, ProbeOptions, ProbeResult } from "./tiers/types.js";

/**
 * Default per-benchmark hard timeout. This is a hang failsafe, not a
 * performance gate — thresholds in tiers/classify.ts gate performance.
 * Generous on purpose: a stack that needs 4s to compile one shader should
 * be *measured* (and downgraded by threshold), not killed mid-probe.
 * The max-buffer probe gets 2× because it allocates multi-GiB buffers.
 */
const DEFAULT_BENCH_TIMEOUT_MS = 5000;

function toMatchedQuirk(entry: QuirkEntry): MatchedQuirk {
  const q: MatchedQuirk = {
    id: entry.id,
    severity: entry.severity,
    summary: entry.summary,
  };
  if (entry.workaround !== undefined) q.workaround = entry.workaround;
  if (entry.sourceUrl !== undefined) q.sourceUrl = entry.sourceUrl;
  return q;
}

/**
 * Probe the current environment for real WebGPU capability.
 *
 * "quick" mode (default): adapter/device acquisition + shader-compile and
 * matmul micro-benchmarks, typically well under 200ms on healthy stacks.
 * "full" mode adds buffer-bandwidth and max-usable-buffer probes (~1–3s).
 *
 * Never rejects due to GPU behavior — every GPU failure is folded into the
 * result. Throws only when called outside a browser.
 */
export async function probe(options?: ProbeOptions): Promise<ProbeResult> {
  if (!isBrowserEnvironment()) {
    throw new Error(
      "webgpu-radar is browser-only (no navigator here). Call probe() in a browser; for server-side decisions, collect a report client-side.",
    );
  }

  const start = performance.now();
  const mode = options?.mode ?? "quick";
  const timeoutMs = options?.benchTimeoutMs ?? DEFAULT_BENCH_TIMEOUT_MS;

  const environment = detectEnvironment();
  const wasm = await detectWasm();
  const acq = await requestAdapterAndDevice();

  const quirks = matchQuirks(
    { ...environment, gpuVendor: acq.gpu?.vendor ?? "" },
    db.entries as QuirkEntry[],
  ).map(toMatchedQuirk);
  const hasBlockingQuirk = quirks.some((q) => q.severity === "blocking");

  const benchmarks: BenchmarkResults = {
    shaderCompile: null,
    matmul: null,
    bandwidth: null,
    maxBuffer: null,
  };

  // Step 4a of the decision tree: a blocking quirk decides the tier by
  // itself, so benchmarks are skipped — no point exercising a device we
  // already know misbehaves (and some quirks make doing so risky).
  if (acq.device && !hasBlockingQuirk) {
    const device = acq.device;
    benchmarks.shaderCompile = await runBench("shader-compile", timeoutMs, () =>
      benchShaderCompile(device),
    );
    benchmarks.matmul = await runBench("matmul", timeoutMs, () => benchMatmul(device));
    if (mode === "full") {
      benchmarks.bandwidth = await runBench("buffer-bandwidth", timeoutMs, () =>
        benchBufferBandwidth(device),
      );
      benchmarks.maxBuffer = await runBench("max-buffer", timeoutMs * 2, () =>
        benchMaxBuffer(device),
      );
    }
  }
  acq.device?.destroy();

  const { tier, reasons } = classify({
    webgpu: {
      apiAvailable: acq.apiAvailable,
      adapterObtained: acq.adapterObtained,
      deviceObtained: acq.deviceObtained,
    },
    quirks,
    benchmarks,
    wasm,
    mode,
    ...(options?.thresholds !== undefined && { thresholds: options.thresholds }),
  });
  if (acq.failureReason) reasons.unshift(acq.failureReason);

  return {
    tier,
    reasons,
    environment,
    gpu: acq.gpu,
    webgpu: {
      apiAvailable: acq.apiAvailable,
      adapterObtained: acq.adapterObtained,
      deviceObtained: acq.deviceObtained,
    },
    benchmarks,
    quirks,
    wasm,
    mode,
    durationMs: performance.now() - start,
  };
}

export { generateReport } from "./report.js";
export { DEFAULT_THRESHOLDS } from "./tiers/classify.js";
export { VERSION } from "./version.js";
export type {
  ProbeResult,
  ProbeOptions,
  ProbeThresholds,
  Tier,
  MatchedQuirk,
  EnvironmentInfo,
  GpuInfo,
  WasmInfo,
  BenchmarkResults,
  BenchOutcome,
} from "./tiers/types.js";
