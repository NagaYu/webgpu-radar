/**
 * Subpath entry: `webgpu-radar/bench`.
 * Individual benchmarks for advanced users. Each takes a live GPUDevice and
 * throws on failure; wrap with runBench() for timeout + error capture.
 */
export { benchShaderCompile } from "./shader-compile.js";
export { benchMatmul } from "./matmul.js";
export { benchBufferBandwidth } from "./buffer-bandwidth.js";
export { benchMaxBuffer } from "./max-buffer.js";
export { runBench } from "./runner.js";
