/**
 * WASM SIMD / threads feature detection.
 *
 * SIMD is detected by actually validating a tiny module that uses a v128
 * instruction (the wasm-feature-detect technique) — never by UA/version
 * lookup, which would miss flags, forks, and enterprise policies.
 */
import type { WasmInfo } from "../tiers/types.js";

// Smallest valid module exercising SIMD; validation fails on engines without
// the SIMD proposal. Byte sequence is the canonical one from
// wasm-feature-detect (MIT): magic + version, a () -> v128 type, one function
// whose body is `i32.const 0; i8x16.splat; i16x8.extract_lane_s 0; end`.
const SIMD_MODULE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03,
  0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62, 0x0b,
]);

// Trivial empty module — proves the engine itself works.
const TRIVIAL_MODULE = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

/**
 * Detect WASM availability, SIMD, and threads support. Never throws.
 *
 * Threads require both a SharedArrayBuffer-capable context (cross-origin
 * isolated since Spectre mitigations) and engine support for shared
 * WebAssembly.Memory — constructing one tests both at once.
 */
export async function detectWasm(): Promise<WasmInfo> {
  const unavailable: WasmInfo = { available: false, simd: false, threads: false };
  try {
    if (typeof WebAssembly !== "object" || typeof WebAssembly.validate !== "function") {
      return unavailable;
    }
    const available = WebAssembly.validate(TRIVIAL_MODULE);
    if (!available) return unavailable;

    let simd = false;
    try {
      simd = WebAssembly.validate(SIMD_MODULE);
    } catch {
      simd = false;
    }

    let threads = false;
    try {
      threads =
        typeof SharedArrayBuffer === "function" &&
        new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true }).buffer instanceof
          SharedArrayBuffer;
    } catch {
      threads = false;
    }

    return { available, simd, threads };
  } catch {
    return unavailable;
  }
}
