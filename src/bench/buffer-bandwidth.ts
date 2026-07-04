/**
 * Buffer bandwidth benchmark (full mode only).
 *
 * Measures the achieved JS→GPU→JS round trip: writeBuffer, a GPU-side copy,
 * and a mapped readback, timed together. This is deliberately *effective*
 * bandwidth including driver/IPC overhead — the number that matters when an
 * app streams model weights — not theoretical PCIe or VRAM bandwidth.
 *
 * Size rationale: 32 MiB is large enough to amortize per-submission overhead
 * into a stable GB/s figure, small enough to round-trip in tens of ms on
 * anything healthy, keeping full mode inside its ~2–3s budget.
 */
import type { BandwidthBench } from "../tiers/types.js";

const DEFAULT_BYTES = 32 * 1024 * 1024;

export async function benchBufferBandwidth(
  device: GPUDevice,
  options?: { bytes?: number },
): Promise<BandwidthBench> {
  const bytes = options?.bytes ?? DEFAULT_BYTES;

  const U = GPUBufferUsage;
  const gpuBuffer = device.createBuffer({ size: bytes, usage: U.COPY_DST | U.COPY_SRC });
  const readback = device.createBuffer({ size: bytes, usage: U.COPY_DST | U.MAP_READ });

  try {
    const payload = new Uint8Array(bytes);
    // Non-uniform pattern defeats any hypothetical zero-page shortcuts.
    for (let i = 0; i < bytes; i += 4096) payload[i] = i & 0xff;

    const start = performance.now();
    device.queue.writeBuffer(gpuBuffer, 0, payload);
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(gpuBuffer, 0, readback, 0, bytes);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const view = new Uint8Array(readback.getMappedRange());
    // Spot-check head and tail so a broken copy can't report great numbers.
    const okData = view[0] === payload[0] && view[bytes - 4096] === payload[bytes - 4096];
    const seconds = (performance.now() - start) / 1000;
    readback.unmap();

    if (!okData) throw new Error("bandwidth round trip returned corrupted data");
    // Bytes moved: upload + GPU copy + readback ≈ 2× user-visible transfers;
    // we count only the two host transfers (up + down) to stay conservative.
    const gbps = (2 * bytes) / seconds / 1e9;
    return { gbps, bytes };
  } finally {
    gpuBuffer.destroy();
    readback.destroy();
  }
}
