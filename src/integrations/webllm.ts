/**
 * Subpath entry: `webgpu-radar/webllm`.
 *
 * WebLLM model recommendation helper. Dependency-free by design: it returns
 * a recommendation object; the calling app passes the chosen model id to
 * WebLLM itself (which is an optional peer dependency, never imported here).
 */
import type { ProbeResult } from "../tiers/types.js";

export interface WebLLMModelCandidate {
  /** A WebLLM prebuilt model id (or your own custom model id). */
  modelId: string;
  /**
   * Rough VRAM the model needs, in MB. Ballpark figures: ~0.55 bytes/param
   * for q4f16 weights plus KV-cache/runtime overhead. Treat as ordering
   * information, not a guarantee — pass your own catalog for real apps.
   */
  vramRequiredMB: number;
  /** Relative quality rank within the candidate list (higher = better). */
  quality: number;
}

/**
 * A small default catalog so the helper works out of the box. IDs follow
 * WebLLM's prebuilt naming (model-quantization-MLC). Check them against the
 * WebLLM version you ship: prebuilt lists change between releases, which is
 * exactly why the catalog is a parameter.
 */
export const DEFAULT_MODEL_CANDIDATES: readonly WebLLMModelCandidate[] = [
  { modelId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", vramRequiredMB: 950, quality: 1 },
  { modelId: "Llama-3.2-1B-Instruct-q4f16_1-MLC", vramRequiredMB: 1200, quality: 2 },
  { modelId: "Llama-3.2-3B-Instruct-q4f16_1-MLC", vramRequiredMB: 2900, quality: 3 },
  { modelId: "Phi-3.5-mini-instruct-q4f16_1-MLC", vramRequiredMB: 3700, quality: 4 },
];

export interface WebLLMRecommendation {
  /**
   * "webgpu": run the recommended model in-browser via WebLLM.
   * "hosted-api": skip in-browser LLM inference on this device.
   */
  action: "webgpu" | "hosted-api";
  /** Set when action is "webgpu". */
  modelId: string | null;
  reasons: string[];
}

export interface WebLLMOptions {
  candidates?: readonly WebLLMModelCandidate[];
  /**
   * VRAM budget in MB for tier webgpu-full. Browsers do not expose real
   * VRAM, so this is caller knowledge (e.g. from your own telemetry or a
   * conservative product decision). Default 4096 fits every candidate in
   * the default catalog on a typical 8 GB-unified-memory machine.
   */
  vramBudgetMB?: number;
}

/**
 * Recommend a WebLLM model (or bailing out to a hosted API) from a probe
 * result. WebLLM requires WebGPU — there is no WASM execution path — so
 * every non-WebGPU tier maps to "hosted-api".
 */
export function recommendWebLLMModel(
  result: ProbeResult,
  options?: WebLLMOptions,
): WebLLMRecommendation {
  const candidates = [...(options?.candidates ?? DEFAULT_MODEL_CANDIDATES)];
  const budgetMB = options?.vramBudgetMB ?? 4096;
  if (candidates.length === 0) {
    return { action: "hosted-api", modelId: null, reasons: ["empty candidate list"] };
  }
  candidates.sort((a, b) => b.quality - a.quality);

  if (result.tier === "webgpu-full") {
    // The max-buffer probe (full mode) gives a hard floor on what a single
    // binding can hold; use it to veto candidates the device provably
    // cannot serve even if the caller's budget says otherwise.
    const maxBuffer = result.benchmarks.maxBuffer;
    const provenMB = maxBuffer?.ok === true ? maxBuffer.value.workingBytes / (1024 * 1024) : null;

    const fits = candidates.filter(
      (c) =>
        c.vramRequiredMB <= budgetMB && (provenMB === null || c.vramRequiredMB / 2 <= provenMB),
    );
    const pick = fits[0];
    if (pick) {
      return {
        action: "webgpu",
        modelId: pick.modelId,
        reasons: [
          `tier webgpu-full: best candidate within ${budgetMB} MB budget`,
          ...(provenMB !== null
            ? [`empirical max buffer ${provenMB.toFixed(0)} MB checked against weight shards`]
            : []),
        ],
      };
    }
    return {
      action: "hosted-api",
      modelId: null,
      reasons: [`no candidate fits the ${budgetMB} MB VRAM budget`],
    };
  }

  if (result.tier === "webgpu-limited") {
    // Limited = works but slow or quirky. The smallest model is the only
    // defensible bet, and only if nothing blocking matched.
    const blocking = result.quirks.some((q) => q.severity === "blocking");
    if (blocking) {
      return {
        action: "hosted-api",
        modelId: null,
        reasons: ["webgpu-limited due to a blocking quirk — do not trust this device's WebGPU"],
      };
    }
    const smallest = candidates.reduce((a, c) => (c.vramRequiredMB < a.vramRequiredMB ? c : a));
    return {
      action: "webgpu",
      modelId: smallest.modelId,
      reasons: [
        "tier webgpu-limited: WebGPU works but underperforms — smallest model recommended; expect slow inference",
      ],
    };
  }

  return {
    action: "hosted-api",
    modelId: null,
    reasons: [`tier ${result.tier}: WebLLM requires WebGPU, which is not usable here`],
  };
}
