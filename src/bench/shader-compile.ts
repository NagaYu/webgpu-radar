/**
 * Shader compile timing benchmark — the WebGPU "cold-start tax".
 *
 * Measures wall-clock ms from createShaderModule() through a resolved
 * createComputePipelineAsync(). The async variant is deliberate: the sync
 * createComputePipeline() may defer backend compilation to first dispatch,
 * which would make this measure nothing. Browsers cache compiled shaders
 * across page loads, so a warm cache legitimately reports near-zero — that
 * is the user's real experience, not a measurement bug, and is why the
 * downgrade threshold only fires on *slow* compiles.
 */
import type { ShaderCompileBench } from "../tiers/types.js";

// Trivial but not degenerate: a loop and a storage write, so the backend
// compiler does real codegen work instead of constant-folding to a no-op.
const PROBE_WGSL = `
@group(0) @binding(0) var<storage, read_write> out: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  var acc = 0.0;
  for (var i = 0u; i < 16u; i = i + 1u) {
    acc = acc + f32(i) * 0.5;
  }
  if (gid.x < arrayLength(&out)) {
    out[gid.x] = acc;
  }
}
`;

export async function benchShaderCompile(device: GPUDevice): Promise<ShaderCompileBench> {
  const start = performance.now();
  const module = device.createShaderModule({ code: PROBE_WGSL });
  const pipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });
  const ms = performance.now() - start;
  // Touch the pipeline so the await above cannot be elided.
  pipeline.getBindGroupLayout(0);
  return { ms };
}
