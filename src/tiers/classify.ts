/**
 * Tier classification decision tree — implements the project's documented
 * tree exactly; every numeric threshold is named here, justified here, and
 * overridable via ProbeOptions.thresholds.
 */
import type { BenchmarkResults, MatchedQuirk, ProbeThresholds, Tier, WasmInfo } from "./types.js";

/**
 * Default thresholds and their rationale.
 *
 * maxShaderCompileMs = 300: our probe kernel is trivial; healthy 2024+
 * browser/driver stacks compile it in well under 50ms even cold, and near
 * 0ms with a warm shader cache. Real AI workloads compile hundreds of far
 * larger kernels, so a stack needing >300ms here implies a multi-second to
 * multi-minute cold start for real models — the exact "API present but
 * unusable in practice" case webgpu-limited exists for.
 *
 * minMatmulGflops = 8: measured floor separating software from hardware.
 * SwiftShader (Chromium's software WebGPU fallback, what CI runners get)
 * measures 0.9 GFLOPS on our N=256 kernel on a GitHub-Actions-class CPU
 * and 4.2 on a fast Apple-Silicon-class host — software scales with CPU,
 * so the floor must clear the *fast-CPU* case. Real GPUs sit far above:
 * Apple metal-3 measured 74.6 despite the kernel being naive and
 * dispatch-overhead-bound. 8 is ~2× the best software result we observed
 * and ~9× below the weakest real-hardware result.
 *
 * minBandwidthGBps = 0.5: streaming a 1 GB quantized model at 0.5 GB/s
 * costs ~2s of pure transfer — about the tolerable ceiling for an in-app
 * loading experience. Healthy discrete/integrated paths measure several
 * GB/s round trip; sustained sub-0.5 indicates a crippled transfer path
 * (remote desktop, exotic virtualization) where WebGPU inference will
 * disappoint regardless of compute throughput.
 *
 * minWorkingBufferBytes = 128 MiB: spec-default maxStorageBufferBindingSize
 * is 128 MiB and per-tensor buffers for practically useful quantized LLMs
 * need on that order. Hardware whose *empirically working* buffer falls
 * below the floor every conformant implementation nominally promises cannot
 * hold real model weights in a single binding.
 */
export const DEFAULT_THRESHOLDS: ProbeThresholds = {
  maxShaderCompileMs: 300,
  minMatmulGflops: 8,
  minBandwidthGBps: 0.5,
  minWorkingBufferBytes: 128 * 1024 * 1024,
};

export interface ClassifyInput {
  webgpu: {
    apiAvailable: boolean;
    adapterObtained: boolean;
    deviceObtained: boolean;
  };
  /** Quirks already matched against the environment (empty if none). */
  quirks: MatchedQuirk[];
  benchmarks: BenchmarkResults;
  wasm: WasmInfo | null;
  mode: "quick" | "full";
  thresholds?: Partial<ProbeThresholds>;
}

export interface Classification {
  tier: Tier;
  reasons: string[];
}

/**
 * Pure decision tree (steps mirror the documented spec):
 * 1–3. No API / no adapter / no usable device → WASM fallback (step 5).
 * 4a. Blocking quirk → webgpu-limited (benchmarks cannot override).
 * 4b–c. Quick benchmarks failing, timing out, or missing thresholds →
 *       webgpu-limited.
 * 4e. Full mode: bandwidth or working-buffer floors can also downgrade.
 * 4d. Otherwise webgpu-full.
 * 5. WASM: simd → wasm-simd, else available → wasm-basic, else unsupported.
 */
export function classify(input: ClassifyInput): Classification {
  const t: ProbeThresholds = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  const reasons: string[] = [];

  // Steps 1–3: anything short of a live device routes to the WASM check.
  if (!input.webgpu.deviceObtained) {
    if (!input.webgpu.apiAvailable) reasons.push("navigator.gpu is not available");
    else if (!input.webgpu.adapterObtained) reasons.push("no WebGPU adapter was obtained");
    else reasons.push("WebGPU device could not be obtained (or was lost immediately)");
    return wasmFallback(input.wasm, reasons);
  }

  // Step 4a: a blocking quirk overrides benchmarks entirely — the whole
  // point of the quirks DB is catching breakage benchmarks can't see.
  const blocking = input.quirks.filter((q) => q.severity === "blocking");
  if (blocking.length > 0) {
    for (const q of blocking) {
      reasons.push(`blocking quirk ${q.id}: ${q.summary}`);
    }
    return { tier: "webgpu-limited", reasons };
  }

  let limited = false;

  // Steps 4b–c: quick benchmarks. On a live device, a benchmark that
  // errored or timed out is itself evidence of a broken implementation —
  // treated the same as missing its threshold.
  const compile = input.benchmarks.shaderCompile;
  if (!compile) {
    limited = true;
    reasons.push("shader-compile benchmark did not run");
  } else if (!compile.ok) {
    limited = true;
    reasons.push(
      compile.timedOut
        ? "shader-compile benchmark timed out"
        : `shader-compile benchmark failed: ${compile.error}`,
    );
  } else if (compile.value.ms > t.maxShaderCompileMs) {
    limited = true;
    reasons.push(
      `shader compile took ${compile.value.ms.toFixed(0)}ms (threshold ${t.maxShaderCompileMs}ms)`,
    );
  }

  const matmul = input.benchmarks.matmul;
  if (!matmul) {
    limited = true;
    reasons.push("matmul benchmark did not run");
  } else if (!matmul.ok) {
    limited = true;
    reasons.push(
      matmul.timedOut ? "matmul benchmark timed out" : `matmul benchmark failed: ${matmul.error}`,
    );
  } else if (matmul.value.gflops < t.minMatmulGflops) {
    limited = true;
    reasons.push(
      `matmul throughput ${matmul.value.gflops.toFixed(1)} GFLOPS (floor ${t.minMatmulGflops})`,
    );
  }

  // Step 4e: full-mode probes may further downgrade. Unlike the quick pair,
  // a full-mode probe that didn't run is not a failure (quick mode simply
  // skips them) — only present-and-bad results downgrade.
  if (input.mode === "full") {
    const bandwidth = input.benchmarks.bandwidth;
    if (bandwidth && !bandwidth.ok) {
      limited = true;
      reasons.push(
        bandwidth.timedOut
          ? "bandwidth benchmark timed out"
          : `bandwidth benchmark failed: ${bandwidth.error}`,
      );
    } else if (bandwidth?.ok && bandwidth.value.gbps < t.minBandwidthGBps) {
      limited = true;
      reasons.push(
        `bandwidth ${bandwidth.value.gbps.toFixed(2)} GB/s (floor ${t.minBandwidthGBps})`,
      );
    }

    const maxBuffer = input.benchmarks.maxBuffer;
    if (maxBuffer && !maxBuffer.ok) {
      limited = true;
      reasons.push(
        maxBuffer.timedOut
          ? "max-buffer probe timed out"
          : `max-buffer probe failed: ${maxBuffer.error}`,
      );
    } else if (maxBuffer?.ok && maxBuffer.value.workingBytes < t.minWorkingBufferBytes) {
      limited = true;
      reasons.push(
        `largest working buffer ${(maxBuffer.value.workingBytes / 1048576).toFixed(0)} MiB ` +
          `(floor ${(t.minWorkingBufferBytes / 1048576).toFixed(0)} MiB; ` +
          `reported ${(maxBuffer.value.reportedBytes / 1048576).toFixed(0)} MiB)`,
      );
    }
  }

  if (limited) return { tier: "webgpu-limited", reasons };

  // Step 4d.
  const warnings = input.quirks.filter((q) => q.severity === "warning");
  for (const q of warnings) {
    reasons.push(`warning quirk ${q.id}: ${q.summary} (does not affect tier)`);
  }
  reasons.push("device obtained and all benchmarks cleared their thresholds");
  return { tier: "webgpu-full", reasons };
}

/** Step 5 of the tree. */
function wasmFallback(wasm: WasmInfo | null, reasons: string[]): Classification {
  if (!wasm || !wasm.available) {
    reasons.push("WebAssembly is not available");
    return { tier: "unsupported", reasons };
  }
  if (wasm.simd) {
    reasons.push("WASM with SIMD is available");
    return { tier: "wasm-simd", reasons };
  }
  reasons.push("WASM is available but SIMD is not");
  return { tier: "wasm-basic", reasons };
}
