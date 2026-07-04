import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateReport } from "../../src/report.js";
import type { ProbeResult } from "../../src/tiers/types.js";
import { VERSION } from "../../src/version.js";

function result(overrides?: Partial<ProbeResult>): ProbeResult {
  return {
    tier: "webgpu-full",
    reasons: ["device obtained and all benchmarks cleared their thresholds"],
    environment: { browser: "chrome", browserVersion: "131", os: "macos" },
    gpu: { vendor: "apple", architecture: "metal-3", device: "", description: "" },
    webgpu: { apiAvailable: true, adapterObtained: true, deviceObtained: true },
    benchmarks: {
      shaderCompile: { ok: true, value: { ms: 42.31 } },
      matmul: { ok: true, value: { gflops: 74.57, size: 256, iterations: 4 } },
      bandwidth: { ok: false, error: "boom", timedOut: false },
      maxBuffer: { ok: false, error: "slow", timedOut: true },
    },
    quirks: [],
    wasm: { available: true, simd: true, threads: false },
    mode: "full",
    durationMs: 410.6,
    ...overrides,
  };
}

describe("generateReport", () => {
  it("JSON round-trips the full ProbeResult", () => {
    const { json } = generateReport(result());
    expect(JSON.parse(json)).toEqual(result());
  });

  it("JSON contains no fingerprinting-adjacent fields", () => {
    const { json } = generateReport(result());
    for (const banned of ["userAgent", "screen", "font", "language", "timezone"]) {
      expect(json).not.toContain(banned);
    }
  });

  it("markdown covers tier, environment, benchmarks, and reasons", () => {
    const { markdown } = generateReport(result());
    expect(markdown).toContain(`## webgpu-radar v${VERSION} report`);
    expect(markdown).toContain("`webgpu-full`");
    expect(markdown).toContain("chrome 131 on macos");
    expect(markdown).toContain("apple / metal-3");
    expect(markdown).toContain("42.3 ms");
    expect(markdown).toContain("74.6 GFLOPS");
    expect(markdown).toContain("❌ boom"); // failed benchmark shown honestly
    expect(markdown).toContain("⏱ timed out");
    expect(markdown).toContain("### Why this tier");
  });

  it("renders quirks and not-run benchmarks", () => {
    const { markdown } = generateReport(
      result({
        quirks: [{ id: "test-quirk", severity: "warning", summary: "acts weird" }],
        benchmarks: { shaderCompile: null, matmul: null, bandwidth: null, maxBuffer: null },
      }),
    );
    expect(markdown).toContain("`test-quirk` (warning): acts weird");
    expect(markdown).toContain("not run");
  });

  it("embeds the raw JSON in a details block", () => {
    const { markdown, json } = generateReport(result());
    expect(markdown).toContain("<details>");
    expect(markdown).toContain(json);
  });
});

describe("VERSION", () => {
  it("stays in sync with package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(VERSION).toBe(pkg.version);
  });
});
