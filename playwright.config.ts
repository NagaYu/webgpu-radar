import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests run probe() end-to-end against real browsers, served over
 * http://localhost (WebGPU requires a secure context; an opaque origin like
 * about:blank does not qualify).
 *
 * What to expect per engine (observed 2026-07, see CONTRIBUTING.md):
 * - Chromium headless-shell (Playwright's default headless) exposes NO
 *   navigator.gpu at all on macOS; on Linux CI with the flags below it gets
 *   SwiftShader software WebGPU (≈1-4 GFLOPS → tier webgpu-limited). Either
 *   way the tests pass: they assert shape and honesty, never speed.
 * - Playwright's Firefox and WebKit builds do not expose WebGPU today, so
 *   they exercise the WASM fallback path — that is valuable coverage of
 *   steps 1→5 of the tier decision tree, not a skipped test.
 */
export default defineConfig({
  testDir: "test/browser",
  timeout: 60_000,
  webServer: {
    command: "node scripts/serve.mjs",
    port: 8787,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:8787",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan"],
        },
      },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
