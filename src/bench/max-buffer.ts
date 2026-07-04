/**
 * Max usable buffer probe (full mode only).
 *
 * `adapter.limits.maxStorageBufferBindingSize` is a promise, not a
 * guarantee: allocation can fail under memory pressure, driver
 * fragmentation, or implementation bugs long before the reported limit.
 * This probe searches upward for the largest storage buffer that actually
 * (a) allocates, (b) binds to a compute pipeline, (c) is written by a
 * dispatch, and (d) round-trips its last element back to JS. The gap
 * between reported and working is exactly the undocumented constraint this
 * project exists to surface.
 *
 * Search strategy: start at 64 MiB (below every spec-default limit), double
 * until failure or the reported limit, then one midpoint refinement between
 * last-good and first-bad. Coarse on purpose — each step allocates real
 * VRAM, and a ±25% answer in ~6 steps beats a byte-exact answer in 30.
 */
import type { MaxBufferBench } from "../tiers/types.js";

const START_BYTES = 64 * 1024 * 1024;

// Writes a sentinel into the last element; reading it back proves the whole
// buffer range is addressable, not merely allocated.
const TAIL_WRITE_WGSL =
  "@group(0)@binding(0)var<storage,read_write>b:array<u32>;" +
  "@compute@workgroup_size(1)fn main(){b[arrayLength(&b)-1u]=0xC0FFEEu;}";

async function roundTrips(device: GPUDevice, pipeline: GPUComputePipeline, size: number) {
  let buffer: GPUBuffer | null = null;
  let readback: GPUBuffer | null = null;
  try {
    const U = GPUBufferUsage;
    device.pushErrorScope("out-of-memory");
    device.pushErrorScope("validation");
    buffer = device.createBuffer({ size, usage: U.STORAGE | U.COPY_SRC });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer } }],
    });
    readback = device.createBuffer({ size: 4, usage: U.COPY_DST | U.MAP_READ });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(1);
    pass.end();
    encoder.copyBufferToBuffer(buffer, size - 4, readback, 0, 4);
    device.queue.submit([encoder.finish()]);

    const validationError = await device.popErrorScope();
    const oomError = await device.popErrorScope();
    if (oomError || validationError) return false;

    await readback.mapAsync(GPUMapMode.READ);
    const value = new Uint32Array(readback.getMappedRange())[0];
    readback.unmap();
    return value === 0xc0ffee;
  } catch {
    return false;
  } finally {
    buffer?.destroy();
    readback?.destroy();
  }
}

export async function benchMaxBuffer(device: GPUDevice): Promise<MaxBufferBench> {
  // The device was requested with the adapter's own max limits (see
  // detect/adapter.ts), so device.limits reflects the adapter's ceiling.
  // We report the storage-binding limit (the one AI workloads hit), but the
  // search ceiling must also respect maxBufferSize — a buffer must first
  // exist before it can be bound — and array<u32> needs 4-byte alignment.
  const reportedBytes = device.limits.maxStorageBufferBindingSize;
  const ceiling = Math.floor(Math.min(reportedBytes, device.limits.maxBufferSize) / 4) * 4;

  const module = device.createShaderModule({ code: TAIL_WRITE_WGSL });
  const pipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });

  let good = 0;
  let firstBad = 0;
  let size = Math.min(START_BYTES, ceiling);
  while (size <= ceiling) {
    if (await roundTrips(device, pipeline, size)) {
      good = size;
      if (size === ceiling) break; // the full reported ceiling works
      size = Math.min(size * 2, ceiling);
    } else {
      firstBad = size;
      break;
    }
  }

  // One midpoint refinement narrows the bracket to ±25% of the doubling gap.
  if (firstBad > good && good > 0) {
    const mid = Math.floor((good + firstBad) / 2 / 4) * 4; // 4-byte align
    if (mid > good && (await roundTrips(device, pipeline, mid))) good = mid;
  }

  return { reportedBytes, workingBytes: good };
}
