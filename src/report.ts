/**
 * Shareable report generation.
 *
 * Privacy stance: the report contains exactly the ProbeResult — browser
 * family + major version, OS family, GPU vendor/architecture as the adapter
 * itself reports them, benchmark numbers, and tier reasoning. Deliberately
 * absent: the raw UA string, screen metrics, fonts, locale, or anything else
 * that inches toward fingerprinting. Nothing is transmitted anywhere; the
 * user shares it manually (GitHub issue) if they choose to.
 */
import type { BenchOutcome, ProbeResult } from "./tiers/types.js";
import { VERSION } from "./version.js";

function mib(bytes: number): string {
  return `${(bytes / 1048576).toFixed(0)} MiB`;
}

function outcomeCell<T>(outcome: BenchOutcome<T> | null, render: (value: T) => string): string {
  if (!outcome) return "not run";
  if (!outcome.ok) return outcome.timedOut ? "⏱ timed out" : `❌ ${outcome.error}`;
  return render(outcome.value);
}

const check = (ok: boolean) => (ok ? "✅" : "❌");

/**
 * Render a ProbeResult as { json, markdown }. The Markdown is pre-formatted
 * to paste directly into the `quirk-report` GitHub issue template.
 */
export function generateReport(result: ProbeResult): { json: string; markdown: string } {
  const json = JSON.stringify(result, null, 2);

  const gpuLine = result.gpu
    ? `${result.gpu.vendor || "?"} / ${result.gpu.architecture || "?"}${result.gpu.device ? ` (${result.gpu.device})` : ""}`
    : "n/a (no adapter)";

  const quirkLines =
    result.quirks.length === 0
      ? ["- none matched"]
      : result.quirks.map((q) => `- \`${q.id}\` (${q.severity}): ${q.summary}`);

  const markdown = [
    `## webgpu-radar v${VERSION} report`,
    "",
    `- **Tier:** \`${result.tier}\``,
    `- **Mode:** ${result.mode} · probe took ${Math.round(result.durationMs)}ms`,
    `- **Browser:** ${result.environment.browser} ${result.environment.browserVersion || "?"} on ${result.environment.os}`,
    `- **GPU:** ${gpuLine}`,
    `- **WebGPU:** api ${check(result.webgpu.apiAvailable)} · adapter ${check(result.webgpu.adapterObtained)} · device ${check(result.webgpu.deviceObtained)}`,
    `- **WASM:** ${
      result.wasm
        ? `available ${check(result.wasm.available)} · simd ${check(result.wasm.simd)} · threads ${check(result.wasm.threads)}`
        : "not probed"
    }`,
    "",
    "### Benchmarks",
    "",
    "| Benchmark | Result |",
    "| --- | --- |",
    `| Shader compile | ${outcomeCell(result.benchmarks.shaderCompile, (v) => `${v.ms.toFixed(1)} ms`)} |`,
    `| Matmul | ${outcomeCell(
      result.benchmarks.matmul,
      (v) => `${v.gflops.toFixed(1)} GFLOPS (N=${v.size}, ×${v.iterations})`,
    )} |`,
    `| Bandwidth | ${outcomeCell(
      result.benchmarks.bandwidth,
      (v) => `${v.gbps.toFixed(2)} GB/s (${mib(v.bytes)})`,
    )} |`,
    `| Max buffer | ${outcomeCell(
      result.benchmarks.maxBuffer,
      (v) => `working ${mib(v.workingBytes)} / reported ${mib(v.reportedBytes)}`,
    )} |`,
    "",
    "### Why this tier",
    "",
    ...result.reasons.map((r) => `- ${r}`),
    "",
    "### Matched quirks",
    "",
    ...quirkLines,
    "",
    "<details><summary>Raw JSON</summary>",
    "",
    "```json",
    json,
    "```",
    "",
    "</details>",
    "",
  ].join("\n");

  return { json, markdown };
}
