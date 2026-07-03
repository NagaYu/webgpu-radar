import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, classify } from "../../src/tiers/classify.js";
import type { ClassifyInput } from "../../src/tiers/classify.js";
import type { BenchmarkResults, MatchedQuirk } from "../../src/tiers/types.js";

const NO_BENCH: BenchmarkResults = {
  shaderCompile: null,
  matmul: null,
  bandwidth: null,
  maxBuffer: null,
};

function goodBench(overrides?: Partial<BenchmarkResults>): BenchmarkResults {
  return {
    shaderCompile: { ok: true, value: { ms: 20 } },
    matmul: { ok: true, value: { gflops: 200, size: 256, iterations: 4 } },
    bandwidth: null,
    maxBuffer: null,
    ...overrides,
  };
}

function input(partial: Partial<ClassifyInput>): ClassifyInput {
  return {
    webgpu: { apiAvailable: true, adapterObtained: true, deviceObtained: true },
    quirks: [],
    benchmarks: goodBench(),
    wasm: { available: true, simd: true, threads: false },
    mode: "quick",
    ...partial,
  };
}

const blockingQuirk: MatchedQuirk = {
  id: "test-blocking",
  severity: "blocking",
  summary: "device present but compute output is wrong",
};

describe("classify — WASM fallback path (steps 1–3, 5)", () => {
  it("no navigator.gpu → wasm-simd when SIMD available", () => {
    const r = classify(
      input({
        webgpu: { apiAvailable: false, adapterObtained: false, deviceObtained: false },
        benchmarks: NO_BENCH,
      }),
    );
    expect(r.tier).toBe("wasm-simd");
  });

  it("adapter null → wasm-basic when SIMD unavailable", () => {
    const r = classify(
      input({
        webgpu: { apiAvailable: true, adapterObtained: false, deviceObtained: false },
        benchmarks: NO_BENCH,
        wasm: { available: true, simd: false, threads: false },
      }),
    );
    expect(r.tier).toBe("wasm-basic");
  });

  it("device lost immediately and no WASM → unsupported", () => {
    const r = classify(
      input({
        webgpu: { apiAvailable: true, adapterObtained: true, deviceObtained: false },
        benchmarks: NO_BENCH,
        wasm: { available: false, simd: false, threads: false },
      }),
    );
    expect(r.tier).toBe("unsupported");
  });

  it("wasm info missing entirely → unsupported", () => {
    const r = classify(
      input({
        webgpu: { apiAvailable: false, adapterObtained: false, deviceObtained: false },
        benchmarks: NO_BENCH,
        wasm: null,
      }),
    );
    expect(r.tier).toBe("unsupported");
  });
});

describe("classify — quirk overrides (step 4a)", () => {
  it("blocking quirk forces webgpu-limited even with perfect benchmarks", () => {
    const r = classify(input({ quirks: [blockingQuirk] }));
    expect(r.tier).toBe("webgpu-limited");
    expect(r.reasons.join(" ")).toContain("test-blocking");
  });

  it("warning quirk does not downgrade", () => {
    const warning: MatchedQuirk = { ...blockingQuirk, id: "test-warning", severity: "warning" };
    const r = classify(input({ quirks: [warning] }));
    expect(r.tier).toBe("webgpu-full");
    expect(r.reasons.join(" ")).toContain("test-warning");
  });
});

describe("classify — quick benchmarks (steps 4b–d)", () => {
  it("healthy device with good benchmarks → webgpu-full", () => {
    expect(classify(input({})).tier).toBe("webgpu-full");
  });

  it("slow shader compile → webgpu-limited", () => {
    const r = classify(
      input({ benchmarks: goodBench({ shaderCompile: { ok: true, value: { ms: 2000 } } }) }),
    );
    expect(r.tier).toBe("webgpu-limited");
  });

  it("low matmul throughput (SwiftShader-like) → webgpu-limited", () => {
    const r = classify(
      input({
        benchmarks: goodBench({
          matmul: { ok: true, value: { gflops: 0.9, size: 256, iterations: 4 } },
        }),
      }),
    );
    expect(r.tier).toBe("webgpu-limited");
  });

  it("benchmark timeout on a live device → webgpu-limited", () => {
    const r = classify(
      input({
        benchmarks: goodBench({ matmul: { ok: false, error: "timeout", timedOut: true } }),
      }),
    );
    expect(r.tier).toBe("webgpu-limited");
    expect(r.reasons.join(" ")).toContain("timed out");
  });

  it("thresholds are overridable", () => {
    const r = classify(
      input({
        benchmarks: goodBench({
          matmul: { ok: true, value: { gflops: 0.5, size: 256, iterations: 4 } },
        }),
        thresholds: { minMatmulGflops: 0.1 },
      }),
    );
    expect(r.tier).toBe("webgpu-full");
  });
});

describe("classify — full-mode downgrades (step 4e)", () => {
  it("low bandwidth downgrades in full mode", () => {
    const r = classify(
      input({
        mode: "full",
        benchmarks: goodBench({
          bandwidth: { ok: true, value: { gbps: 0.1, bytes: 1 } },
        }),
      }),
    );
    expect(r.tier).toBe("webgpu-limited");
  });

  it("small working buffer downgrades in full mode", () => {
    const r = classify(
      input({
        mode: "full",
        benchmarks: goodBench({
          maxBuffer: {
            ok: true,
            value: { reportedBytes: 2 ** 30, workingBytes: 64 * 1024 * 1024 },
          },
        }),
      }),
    );
    expect(r.tier).toBe("webgpu-limited");
    expect(r.reasons.join(" ")).toContain("largest working buffer");
  });

  it("missing full-mode probes do not downgrade in quick mode", () => {
    expect(classify(input({ mode: "quick" })).tier).toBe("webgpu-full");
  });

  it("full-mode probe absent (skipped) does not downgrade in full mode either", () => {
    expect(classify(input({ mode: "full" })).tier).toBe("webgpu-full");
  });
});

describe("classify — defaults sanity", () => {
  it("default thresholds match their documented values", () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      maxShaderCompileMs: 300,
      minMatmulGflops: 8,
      minBandwidthGBps: 0.5,
      minWorkingBufferBytes: 128 * 1024 * 1024,
    });
  });
});
