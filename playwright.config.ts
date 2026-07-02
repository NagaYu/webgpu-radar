import { defineConfig, devices } from "@playwright/test";

// Browser tests run probe() end-to-end against a real browser.
// WebGPU availability in headless/CI environments varies; see CONTRIBUTING.md
// for what to expect from GitHub Actions runners (software rendering caveats).
export default defineConfig({
  testDir: "test/browser",
  timeout: 60_000,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Headless Chromium needs explicit flags for WebGPU today.
          // Revisit as headless WebGPU support matures.
          args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan"],
        },
      },
    },
  ],
});
