/**
 * Subpath entry: `webgpu-radar/transformers-js`.
 *
 * Transformers.js device-selection helper. Dependency-free: returns a
 * recommendation object; pass `device` (and optionally `dtype`) into your
 * `pipeline(..., { device })` call yourself.
 */
import type { ProbeResult } from "../tiers/types.js";

export interface TransformersRecommendation {
  /** Value for Transformers.js `device` option. */
  device: "webgpu" | "wasm";
  /**
   * Suggested dtype: "fp16" where WebGPU is healthy (fastest on modern
   * GPUs), "q8" for the WASM path (quantized weights keep downloads and
   * CPU inference tolerable). Override freely — this is a hint.
   */
  dtype: "fp16" | "q8";
  reasons: string[];
}

/**
 * Map a probe result to a Transformers.js device choice. Unlike WebLLM,
 * Transformers.js has a real WASM backend, so every tier gets a working
 * answer — the question is only webgpu vs wasm.
 */
export function recommendTransformersDevice(result: ProbeResult): TransformersRecommendation {
  if (result.tier === "webgpu-full") {
    return {
      device: "webgpu",
      dtype: "fp16",
      reasons: ["tier webgpu-full: benchmarks cleared all thresholds"],
    };
  }
  if (result.tier === "webgpu-limited") {
    return {
      device: "wasm",
      dtype: "q8",
      reasons: [
        "tier webgpu-limited: WebGPU is present but slow or quirky here — WASM avoids the cold-start and correctness risk",
        ...result.reasons,
      ],
    };
  }
  const simdNote =
    result.tier === "wasm-simd"
      ? "WASM SIMD available: quantized CPU inference is viable for small models"
      : "no SIMD (or no WASM): expect very slow inference — consider a hosted API for anything beyond tiny models";
  return { device: "wasm", dtype: "q8", reasons: [`tier ${result.tier}: ${simdNote}`] };
}
