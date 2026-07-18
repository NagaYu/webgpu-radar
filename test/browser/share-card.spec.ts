/**
 * Smoke tests for the demo site's shareable result card. Served page under
 * test: /site/ (requires the site bundle: `pnpm build && node
 * scripts/prepare-site.mjs`).
 *
 * Like probe.spec.ts these assert SHAPE, never speed: on CI runners the tier
 * will be a WASM fallback — the card must render for every tier.
 */
import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __openedUrls?: string[];
  }
}

test.beforeEach(async ({ page }) => {
  // Record window.open targets instead of opening real popups.
  await page.addInitScript(() => {
    window.__openedUrls = [];
    window.open = ((url?: string | URL) => {
      window.__openedUrls?.push(String(url));
      return null;
    }) as typeof window.open;
  });
  await page.goto("/site/");
  // The page kicks off a quick probe on load; wait for it to resolve.
  await page.waitForFunction(
    () => {
      const t = document.getElementById("tier")?.textContent ?? "";
      return t !== "" && t !== "probing…";
    },
    undefined,
    { timeout: 30_000 },
  );
});

test("card canvas renders after a probe and share buttons exist", async ({ page }) => {
  const canvas = page.locator("#share-card");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("width", "1200");
  await expect(canvas).toHaveAttribute("height", "630");

  // The card must actually be drawn, not a blank transparent canvas.
  const drawn = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    return data.some((v, i) => i % 4 === 3 && v > 0);
  });
  expect(drawn).toBe(true);

  await expect(page.locator("#card-download")).toBeVisible();
  await expect(page.locator("#card-copy")).toBeVisible();
  await expect(page.locator("#share-x")).toBeVisible();
  // The pre-existing actions must survive the addition.
  await expect(page.locator("#copy")).toBeVisible();
  await expect(page.locator("#download")).toBeVisible();
});

test("size toggle re-renders the card at 1080×1080", async ({ page }) => {
  await page.click("#size-square");
  const canvas = page.locator("#share-card");
  await expect(canvas).toHaveAttribute("width", "1080");
  await expect(canvas).toHaveAttribute("height", "1080");
  await expect(page.locator("#size-square")).toHaveAttribute("aria-pressed", "true");
});

test("Share on X opens a tweet intent with short text and the demo URL", async ({ page }) => {
  await page.click("#share-x");
  const urls = await page.evaluate(() => window.__openedUrls ?? []);
  expect(urls).toHaveLength(1);

  const intent = new URL(urls[0]);
  expect(`${intent.origin}${intent.pathname}`).toBe("https://twitter.com/intent/tweet");
  expect(intent.searchParams.get("url")).toBe("https://nagayu.github.io/webgpu-radar/");

  const text = intent.searchParams.get("text") ?? "";
  expect(text).toContain("webgpu-radar");
  expect(text).toContain("#WebGPU");
  expect(text).toContain("tier ");
  expect(text.length).toBeLessThanOrEqual(200);
});
