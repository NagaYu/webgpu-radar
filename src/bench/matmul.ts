/**
 * Matmul throughput benchmark.
 *
 * Size rationale: N=256 (2·256³ ≈ 33.6 MFLOP per pass, ×4 passes ≈ 134 MFLOP
 * timed). On any healthy 2024+ GPU this finishes in single-digit ms — far
 * under the 100ms guidance — while a software implementation (SwiftShader
 * measures ~1 GFLOPS) needs >100ms, giving clean separation for tiering.
 * The number is deliberately dispatch-overhead-inclusive: we are probing
 * "what throughput does a small AI kernel actually get", not peak TFLOPS,
 * so a naive one-thread-per-output-element kernel is the honest choice.
 */
import type { MatmulBench } from "../tiers/types.js";

const DEFAULT_SIZE = 256;
const DEFAULT_ITERATIONS = 4;
const WORKGROUP_DIM = 8;

// One thread per output element: c[y][x] = dot(row y of a, column x of b).
// Kept dense (short names, no whitespace) because the string survives
// minification verbatim and the core bundle has a 5KB budget.
function matmulWgsl(n: number): string {
  return `@group(0)@binding(0)var<storage,read>a:array<f32>;@group(0)@binding(1)var<storage,read>b:array<f32>;@group(0)@binding(2)var<storage,read_write>c:array<f32>;@compute@workgroup_size(${WORKGROUP_DIM},${WORKGROUP_DIM})fn main(@builtin(global_invocation_id)g:vec3<u32>){let n=${n}u;if(g.y>=n||g.x>=n){return;}var s=0.0;for(var k=0u;k<n;k=k+1u){s=s+a[g.y*n+k]*b[k*n+g.x];}c[g.y*n+g.x]=s;}`;
}

export interface MatmulOptions {
  /** Square matrix dimension; kernel rounds dispatch up to workgroup size 8. */
  size?: number;
  iterations?: number;
}

export async function benchMatmul(
  device: GPUDevice,
  options?: MatmulOptions,
): Promise<MatmulBench> {
  const size = options?.size ?? DEFAULT_SIZE;
  const iterations = options?.iterations ?? DEFAULT_ITERATIONS;
  const bytes = size * size * 4;

  const module = device.createShaderModule({ code: matmulWgsl(size) });
  const pipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });

  const U = GPUBufferUsage; // aliased: this global's long member paths don't minify
  const usage = U.STORAGE | U.COPY_DST;
  const a = device.createBuffer({ size: bytes, usage });
  const b = device.createBuffer({ size: bytes, usage });
  const c = device.createBuffer({ size: bytes, usage: usage | U.COPY_SRC });
  const readback = device.createBuffer({
    size: 4,
    usage: U.COPY_DST | U.MAP_READ,
  });

  try {
    // All-ones inputs make every output element exactly `size` in f32,
    // giving a cheap correctness check that the kernel really ran.
    const ones = new Float32Array(size * size).fill(1);
    device.queue.writeBuffer(a, 0, ones);
    device.queue.writeBuffer(b, 0, ones);

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: a } },
        { binding: 1, resource: { buffer: b } },
        { binding: 2, resource: { buffer: c } },
      ],
    });

    const groups = Math.ceil(size / WORKGROUP_DIM);
    const encodePass = (encoder: GPUCommandEncoder, passes: number) => {
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      for (let i = 0; i < passes; i++) {
        pass.dispatchWorkgroups(groups, groups);
      }
      pass.end();
    };

    // Warm-up: first dispatch absorbs lazy pipeline/driver setup costs that
    // would otherwise be misattributed to throughput.
    const warmup = device.createCommandEncoder();
    encodePass(warmup, 1);
    device.queue.submit([warmup.finish()]);
    await device.queue.onSubmittedWorkDone();

    const timed = device.createCommandEncoder();
    encodePass(timed, iterations);
    const start = performance.now();
    device.queue.submit([timed.finish()]);
    await device.queue.onSubmittedWorkDone();
    const seconds = (performance.now() - start) / 1000;

    // Verify outside the timed region: copy one element back and check it.
    const verify = device.createCommandEncoder();
    verify.copyBufferToBuffer(c, 0, readback, 0, 4);
    device.queue.submit([verify.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const value = new Float32Array(readback.getMappedRange())[0];
    readback.unmap();
    if (value === undefined || Math.abs(value - size) > 1e-3) {
      throw new Error(`matmul produced wrong result: c[0]=${value}, expected ${size}`);
    }

    const gflops = (2 * size * size * size * iterations) / seconds / 1e9;
    return { gflops, size, iterations };
  } finally {
    a.destroy();
    b.destroy();
    c.destroy();
    readback.destroy();
  }
}
