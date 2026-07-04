import { describe, expect, it } from "vitest";
import { recommendTransformersDevice } from "../../src/integrations/transformers-js.js";
import { DEFAULT_MODEL_CANDIDATES, recommendWebLLMModel } from "../../src/integrations/webllm.js";
import type { ProbeResult, Tier } from "../../src/tiers/types.js";

function resultForTier(tier: Tier, overrides?: Partial<ProbeResult>): ProbeResult {
  const gpuTier = tier === "webgpu-full" || tier === "webgpu-limited";
  return {
    tier,
    reasons: [],
    environment: { browser: "chrome", browserVersion: "131", os: "macos" },
    gpu: gpuTier ? { vendor: "apple", architecture: "metal-3", device: "", description: "" } : null,
    webgpu: { apiAvailable: gpuTier, adapterObtained: gpuTier, deviceObtained: gpuTier },
    benchmarks: { shaderCompile: null, matmul: null, bandwidth: null, maxBuffer: null },
    quirks: [],
    wasm: { available: tier !== "unsupported", simd: tier !== "wasm-basic", threads: false },
    mode: "quick",
    durationMs: 100,
    ...overrides,
  };
}

describe("recommendWebLLMModel", () => {
  it("webgpu-full picks the best-quality model within budget", () => {
    const r = recommendWebLLMModel(resultForTier("webgpu-full"));
    expect(r.action).toBe("webgpu");
    expect(r.modelId).toBe("Phi-3.5-mini-instruct-q4f16_1-MLC"); // highest quality ≤ 4096 MB
  });

  it("vram budget constrains the pick", () => {
    const r = recommendWebLLMModel(resultForTier("webgpu-full"), { vramBudgetMB: 1500 });
    expect(r.modelId).toBe("Llama-3.2-1B-Instruct-q4f16_1-MLC");
  });

  it("no fit within budget → hosted-api", () => {
    const r = recommendWebLLMModel(resultForTier("webgpu-full"), { vramBudgetMB: 100 });
    expect(r.action).toBe("hosted-api");
    expect(r.modelId).toBeNull();
  });

  it("empirical max-buffer result vetoes oversized models", () => {
    const r = recommendWebLLMModel(
      resultForTier("webgpu-full", {
        mode: "full",
        benchmarks: {
          shaderCompile: null,
          matmul: null,
          bandwidth: null,
          // 512 MiB working buffer: every model whose estimated largest
          // shard (vram/2) exceeds it gets vetoed — only Qwen-0.5B fits.
          maxBuffer: {
            ok: true,
            value: { reportedBytes: 2 ** 31, workingBytes: 512 * 1024 * 1024 },
          },
        },
      }),
    );
    expect(r.modelId).toBe("Qwen2.5-0.5B-Instruct-q4f16_1-MLC");
  });

  it("webgpu-limited recommends the smallest model", () => {
    const r = recommendWebLLMModel(resultForTier("webgpu-limited"));
    expect(r.action).toBe("webgpu");
    const smallest = [...DEFAULT_MODEL_CANDIDATES].sort(
      (a, b) => a.vramRequiredMB - b.vramRequiredMB,
    )[0];
    expect(r.modelId).toBe(smallest?.modelId);
  });

  it("webgpu-limited with a blocking quirk → hosted-api", () => {
    const r = recommendWebLLMModel(
      resultForTier("webgpu-limited", {
        quirks: [{ id: "q", severity: "blocking", summary: "broken" }],
      }),
    );
    expect(r.action).toBe("hosted-api");
  });

  it.each(["wasm-simd", "wasm-basic", "unsupported"] as const)("%s → hosted-api", (tier) => {
    const r = recommendWebLLMModel(resultForTier(tier));
    expect(r.action).toBe("hosted-api");
    expect(r.modelId).toBeNull();
  });

  it("custom candidate catalogs are respected", () => {
    const r = recommendWebLLMModel(resultForTier("webgpu-full"), {
      candidates: [{ modelId: "my-model", vramRequiredMB: 100, quality: 1 }],
    });
    expect(r.modelId).toBe("my-model");
  });
});

describe("recommendTransformersDevice", () => {
  it("webgpu-full → webgpu/fp16", () => {
    expect(recommendTransformersDevice(resultForTier("webgpu-full"))).toMatchObject({
      device: "webgpu",
      dtype: "fp16",
    });
  });

  it.each(["webgpu-limited", "wasm-simd", "wasm-basic", "unsupported"] as const)(
    "%s → wasm/q8",
    (tier) => {
      expect(recommendTransformersDevice(resultForTier(tier))).toMatchObject({
        device: "wasm",
        dtype: "q8",
      });
    },
  );
});
