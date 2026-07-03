/**
 * WebGPU adapter/device acquisition.
 *
 * Spec note (verified 2026-07): adapter metadata lives on the synchronous
 * `GPUAdapter.info` attribute (GPUAdapterInfo). The older asynchronous
 * `adapter.requestAdapterInfo()` was removed from the spec, but browsers
 * shipped it for a long time, so we fall back to it when `info` is absent.
 * Both shapes are handled without depending on either existing.
 */
import type { GpuInfo } from "../tiers/types.js";

/** Adapter limits we carry into benchmarks and reports. */
export interface AdapterLimits {
  maxStorageBufferBindingSize: number;
  maxBufferSize: number;
  maxComputeWorkgroupSizeX: number;
  maxComputeInvocationsPerWorkgroup: number;
}

export interface AdapterAcquisition {
  /** `navigator.gpu` exists. */
  apiAvailable: boolean;
  /** requestAdapter() returned a non-null adapter. */
  adapterObtained: boolean;
  /** requestDevice() succeeded and the device wasn't immediately lost. */
  deviceObtained: boolean;
  /** Live device for benchmarking; caller must destroy() when done. */
  device: GPUDevice | null;
  gpu: GpuInfo | null;
  limits: AdapterLimits | null;
  /** Human-readable reason for the first failed step, if any. */
  failureReason: string | null;
}

const FAILED: Omit<AdapterAcquisition, "apiAvailable" | "failureReason"> = {
  adapterObtained: false,
  deviceObtained: false,
  device: null,
  gpu: null,
  limits: null,
};

/** Read GPUAdapterInfo via the current attribute or the legacy method. */
async function readAdapterInfo(adapter: GPUAdapter): Promise<GpuInfo | null> {
  try {
    let info: GPUAdapterInfo | undefined = adapter.info;
    if (!info) {
      const legacy = adapter as GPUAdapter & {
        requestAdapterInfo?: () => Promise<GPUAdapterInfo>;
      };
      if (typeof legacy.requestAdapterInfo === "function") {
        info = await legacy.requestAdapterInfo();
      }
    }
    if (!info) return null;
    return {
      vendor: info.vendor ?? "",
      architecture: info.architecture ?? "",
      device: info.device ?? "",
      description: info.description ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Acquire adapter + device, mirroring steps 1–3 of the tier decision tree.
 * Never throws: every failure mode collapses into a structured result the
 * classifier can act on.
 */
export async function requestAdapterAndDevice(): Promise<AdapterAcquisition> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    return { apiAvailable: false, failureReason: "navigator.gpu is undefined", ...FAILED };
  }

  let adapter: GPUAdapter | null;
  try {
    adapter = await navigator.gpu.requestAdapter();
  } catch (e) {
    return { apiAvailable: true, failureReason: `requestAdapter() threw: ${msg(e)}`, ...FAILED };
  }
  if (!adapter) {
    return { apiAvailable: true, failureReason: "requestAdapter() returned null", ...FAILED };
  }

  const gpu = await readAdapterInfo(adapter);
  const limits: AdapterLimits = {
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    maxBufferSize: adapter.limits.maxBufferSize,
    maxComputeWorkgroupSizeX: adapter.limits.maxComputeWorkgroupSizeX,
    maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
  };

  let device: GPUDevice | null = null;
  try {
    // Ask for the adapter's real buffer ceilings (guaranteed grantable since
    // they come from the same adapter) so the max-buffer probe can search
    // beyond the spec defaults. Fall back to a default device if a buggy
    // implementation rejects its own limits.
    device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
        maxBufferSize: limits.maxBufferSize,
      },
    });
  } catch {
    try {
      device = await adapter.requestDevice();
    } catch (e) {
      return {
        apiAvailable: true,
        adapterObtained: true,
        deviceObtained: false,
        device: null,
        gpu,
        limits,
        failureReason: `requestDevice() threw: ${msg(e)}`,
      };
    }
  }

  // Step 3 of the decision tree: a device whose `.lost` promise settles
  // immediately is as good as no device. `lost` never rejects per spec, so a
  // flag + one macrotask turn is enough to observe "already lost".
  let lostImmediately: GPUDeviceLostInfo | null = null;
  device.lost.then(
    (info) => {
      lostImmediately = info;
    },
    () => {
      /* spec says lost never rejects; tolerate non-conforming impls */
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (lostImmediately !== null) {
    const info = lostImmediately as GPUDeviceLostInfo;
    return {
      apiAvailable: true,
      adapterObtained: true,
      deviceObtained: false,
      device: null,
      gpu,
      limits,
      failureReason: `device lost immediately (${info.reason}): ${info.message}`,
    };
  }

  return {
    apiAvailable: true,
    adapterObtained: true,
    deviceObtained: true,
    device,
    gpu,
    limits,
    failureReason: null,
  };
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
