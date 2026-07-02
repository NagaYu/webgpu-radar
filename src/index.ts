/**
 * webgpu-radar — real WebGPU capability detection for browser AI.
 *
 * Root entry point. Keep this surface small: probe(), generateReport(),
 * and the public types.
 */
import type { ProbeOptions, ProbeResult } from "./tiers/types.js";

export async function probe(_options?: ProbeOptions): Promise<ProbeResult> {
  throw new Error("Not implemented yet (phase 4 wires this together)");
}

export { generateReport } from "./report.js";
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
