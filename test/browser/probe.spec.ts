/**
 * End-to-end browser tests: real browsers run probe() against the built
 * dist/ bundle (build before running: `pnpm build && pnpm test:browser`).
 *
 * These tests assert SHAPE and HONESTY, never speed: what tier comes out
 * depends entirely on the machine (CI runners have no GPU — see
 * CONTRIBUTING.md for the observed behavior per browser/environment).
 */
import { expect, test } from "@playwright/test";
import type { ProbeResult } from "../../src/tiers/types.js";

const TIERS = ["webgpu-full", "webgpu-limited", "wasm-simd", "wasm-basic", "unsupported"];

declare global {
  interface Window {
    __probeResult?: ProbeResult;
    __probeError?: string;
    __report?: { json: string; markdown: string };
  }
}

test("probe() completes and reports an honest, well-formed result", async ({ page }) => {
  await page.goto("/test/browser/fixture.html");
  await page.waitForFunction(() => window.__probeResult ?? window.__probeError, undefined, {
    timeout: 30_000,
  });

  const error = await page.evaluate(() => window.__probeError);
  expect(error, `probe() must never reject in a browser, got: ${error}`).toBeUndefined();

  const result = (await page.evaluate(() => window.__probeResult)) as ProbeResult;
  expect(TIERS).toContain(result.tier);
  expect(result.reasons.length).toBeGreaterThan(0);
  expect(result.durationMs).toBeGreaterThan(0);
  expect(result.mode).toBe("quick");
  expect(typeof result.environment.browser).toBe("string");
  expect(result.environment.browser).not.toBe("");

  // Honesty invariants: the result must agree with the page's own reality.
  const apiAvailable = await page.evaluate(() => "gpu" in navigator);
  expect(result.webgpu.apiAvailable).toBe(apiAvailable);
  if (!apiAvailable) {
    expect(["wasm-simd", "wasm-basic", "unsupported"]).toContain(result.tier);
  }
  if (result.tier === "webgpu-full") {
    // full can only be earned by passing benchmarks, never by default.
    expect(result.benchmarks.shaderCompile?.ok).toBe(true);
    expect(result.benchmarks.matmul?.ok).toBe(true);
  }
  // Quick mode must not run full-mode probes.
  expect(result.benchmarks.bandwidth).toBeNull();
  expect(result.benchmarks.maxBuffer).toBeNull();
});

test("generateReport() output is issue-template ready", async ({ page }) => {
  await page.goto("/test/browser/fixture.html");
  await page.waitForFunction(() => window.__probeResult ?? window.__probeError, undefined, {
    timeout: 30_000,
  });
  const report = await page.evaluate(() => window.__report);
  expect(report).toBeDefined();
  const parsed = JSON.parse(report?.json ?? "") as ProbeResult;
  expect(TIERS).toContain(parsed.tier);
  expect(report?.markdown).toContain("## webgpu-radar");
  expect(report?.markdown).toContain(`\`${parsed.tier}\``);
  expect(report?.json).not.toContain("userAgent");
});
