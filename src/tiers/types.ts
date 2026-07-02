/**
 * Public types for webgpu-radar.
 *
 * These are the types a consumer sees via the root entry point. Keep this
 * surface small and free of `any`.
 */

/** Capability tiers, in descending order of capability. */
export type Tier = "webgpu-full" | "webgpu-limited" | "wasm-simd" | "wasm-basic" | "unsupported";

/** Browser/OS environment, parsed from the user agent (best-effort). */
export interface EnvironmentInfo {
  /** e.g. "chrome" | "firefox" | "safari" | "edge" | "unknown" */
  browser: string;
  /** Major (or major.minor) version string, "" if unknown. */
  browserVersion: string;
  /** e.g. "macos" | "windows" | "linux" | "android" | "ios" | "unknown" */
  os: string;
}

/** GPU adapter metadata, when the browser exposes it. */
export interface GpuInfo {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
}

/** A quirks-database entry that matched the current environment. */
export interface MatchedQuirk {
  id: string;
  severity: "blocking" | "warning";
  summary: string;
  workaround?: string;
  sourceUrl?: string;
}

/** Result of a single benchmark: value on success, error info on failure. */
export type BenchOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; timedOut: boolean };

export interface ShaderCompileBench {
  /** Wall-clock ms to create the compute pipeline (cold, includes compile). */
  ms: number;
}

export interface MatmulBench {
  gflops: number;
  /** Square matrix dimension used. */
  size: number;
  iterations: number;
}

export interface BandwidthBench {
  /** Achieved round-trip bandwidth in GB/s. */
  gbps: number;
  /** Buffer size used, in bytes. */
  bytes: number;
}

export interface MaxBufferBench {
  /** adapter-reported maxStorageBufferBindingSize. */
  reportedBytes: number;
  /** Largest buffer that empirically allocated and round-tripped. */
  workingBytes: number;
}

export interface BenchmarkResults {
  shaderCompile: BenchOutcome<ShaderCompileBench> | null;
  matmul: BenchOutcome<MatmulBench> | null;
  bandwidth: BenchOutcome<BandwidthBench> | null;
  maxBuffer: BenchOutcome<MaxBufferBench> | null;
}

/** WASM fallback capability. */
export interface WasmInfo {
  available: boolean;
  simd: boolean;
  threads: boolean;
}

/**
 * Thresholds used by tier classification. Every value is overridable via
 * ProbeOptions; defaults are documented at their definition site.
 */
export interface ProbeThresholds {
  /** Shader compile slower than this (ms) downgrades to webgpu-limited. */
  maxShaderCompileMs: number;
  /** Matmul throughput below this (GFLOPS) downgrades to webgpu-limited. */
  minMatmulGflops: number;
  /** (full mode) Bandwidth below this (GB/s) downgrades to webgpu-limited. */
  minBandwidthGBps: number;
}

export interface ProbeOptions {
  /** "quick" (default): shader-compile + tiny matmul. "full": adds bandwidth + max-buffer. */
  mode?: "quick" | "full";
  /** Override any classification threshold. */
  thresholds?: Partial<ProbeThresholds>;
  /** Hard timeout per individual benchmark, in ms. */
  benchTimeoutMs?: number;
}

export interface ProbeResult {
  tier: Tier;
  /** Human-readable explanations of how the tier was decided. */
  reasons: string[];
  environment: EnvironmentInfo;
  /** null when no adapter/device was obtained or info is unavailable. */
  gpu: GpuInfo | null;
  webgpu: {
    apiAvailable: boolean;
    adapterObtained: boolean;
    deviceObtained: boolean;
  };
  benchmarks: BenchmarkResults;
  quirks: MatchedQuirk[];
  wasm: WasmInfo | null;
  mode: "quick" | "full";
  /** Total probe wall-clock time in ms. */
  durationMs: number;
}
