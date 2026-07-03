/**
 * Benchmark runner: wraps each benchmark with a hard timeout and converts
 * failures into BenchOutcome errors instead of letting them crash the probe.
 *
 * Note on timeouts: GPU work already submitted cannot be cancelled from JS.
 * A timeout here abandons the wait and reports `timedOut: true`; the queue
 * may still finish (or hang) in the background. That is acceptable for a
 * one-shot capability probe — the caller destroys the device afterwards.
 */
import type { BenchOutcome } from "../tiers/types.js";

class BenchTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} exceeded ${ms}ms timeout`);
    this.name = "BenchTimeoutError";
  }
}

export async function runBench<T>(
  label: string,
  timeoutMs: number,
  fn: () => Promise<T>,
): Promise<BenchOutcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new BenchTimeoutError(label, timeoutMs)), timeoutMs);
      }),
    ]);
    return { ok: true, value };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      timedOut: e instanceof BenchTimeoutError,
    };
  } finally {
    clearTimeout(timer);
  }
}
