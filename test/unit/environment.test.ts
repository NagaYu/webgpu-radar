import { afterEach, describe, expect, it, vi } from "vitest";
import { detectEnvironment, isBrowserEnvironment } from "../../src/detect/environment.js";

/** Stub the global navigator with just the fields the parser reads. */
function withNavigator(nav: object): void {
  vi.stubGlobal("navigator", nav);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Trimmed real-world UA strings (year-2025-era versions).
const UA = {
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86",
  chromeIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  firefoxAndroid: "Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0",
  safariIPadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
};

describe("detectEnvironment — UA string fallback", () => {
  it("Chrome on Windows", () => {
    withNavigator({ userAgent: UA.chromeWindows, maxTouchPoints: 0 });
    expect(detectEnvironment()).toEqual({
      browser: "chrome",
      browserVersion: "131.0",
      os: "windows",
    });
  });

  it("Safari on macOS (Version/ token, not Safari/ token)", () => {
    withNavigator({ userAgent: UA.safariMac, maxTouchPoints: 0 });
    expect(detectEnvironment()).toEqual({ browser: "safari", browserVersion: "26.0", os: "macos" });
  });

  it("Firefox on Linux", () => {
    withNavigator({ userAgent: UA.firefoxLinux, maxTouchPoints: 0 });
    expect(detectEnvironment()).toEqual({
      browser: "firefox",
      browserVersion: "140.0",
      os: "linux",
    });
  });

  it("Edge wins over the Chrome token it also carries", () => {
    withNavigator({ userAgent: UA.edgeWindows, maxTouchPoints: 0 });
    expect(detectEnvironment()).toEqual({
      browser: "edge",
      browserVersion: "131.0",
      os: "windows",
    });
  });

  it("Chrome on iOS uses the CriOS token", () => {
    withNavigator({ userAgent: UA.chromeIOS, maxTouchPoints: 5 });
    expect(detectEnvironment()).toEqual({ browser: "chrome", browserVersion: "131.0", os: "ios" });
  });

  it("Firefox on Android (Android wins over Linux)", () => {
    withNavigator({ userAgent: UA.firefoxAndroid, maxTouchPoints: 5 });
    expect(detectEnvironment()).toEqual({
      browser: "firefox",
      browserVersion: "140.0",
      os: "android",
    });
  });

  it("iPadOS desktop-mode masquerade is caught via maxTouchPoints", () => {
    withNavigator({ userAgent: UA.safariIPadDesktopMode, maxTouchPoints: 5 });
    expect(detectEnvironment().os).toBe("ios");
  });
});

describe("detectEnvironment — userAgentData preferred", () => {
  it("uses brands + platform and skips GREASE entries", () => {
    withNavigator({
      userAgent: UA.chromeWindows,
      maxTouchPoints: 0,
      userAgentData: {
        brands: [
          { brand: "Not_A Brand", version: "99" },
          { brand: "Google Chrome", version: "131" },
          { brand: "Chromium", version: "131" },
        ],
        platform: "Windows",
      },
    });
    expect(detectEnvironment()).toEqual({
      browser: "chrome",
      browserVersion: "131",
      os: "windows",
    });
  });

  it("prefers the specific brand (Edge) over Chromium", () => {
    withNavigator({
      userAgent: UA.edgeWindows,
      maxTouchPoints: 0,
      userAgentData: {
        brands: [
          { brand: "Microsoft Edge", version: "131" },
          { brand: "Chromium", version: "131" },
        ],
        platform: "Windows",
      },
    });
    expect(detectEnvironment().browser).toBe("edge");
  });

  it("falls back to the UA string when platform is empty", () => {
    withNavigator({
      userAgent: UA.chromeWindows,
      maxTouchPoints: 0,
      userAgentData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "" },
    });
    expect(detectEnvironment().os).toBe("windows");
  });
});

describe("non-browser environment", () => {
  it("isBrowserEnvironment is false without navigator", () => {
    // vitest node environment has no navigator... except newer Node defines
    // one; stub it away explicitly to simulate a server runtime.
    vi.stubGlobal("navigator", undefined);
    expect(isBrowserEnvironment()).toBe(false);
    expect(detectEnvironment()).toEqual({ browser: "unknown", browserVersion: "", os: "unknown" });
  });
});
