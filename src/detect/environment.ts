/**
 * Minimal hand-rolled browser/OS detection.
 *
 * Caveat, stated plainly: UA sniffing is inherently imperfect. Browsers spoof
 * each other (every Chromium UA contains "Safari", iOS Chrome is "CriOS",
 * iPadOS 13+ reports itself as macOS), and vendors freeze or reduce UA
 * strings over time. We only need enough fidelity to match quirks-database
 * entries (browser family, major version, OS family) — not analytics-grade
 * accuracy — so this parser is deliberately small and makes no stronger
 * claims. Prefer `navigator.userAgentData` (Chromium) when present, since
 * it is structured and not spoof-oriented.
 */
import type { EnvironmentInfo } from "../tiers/types.js";

/** Structured UA-Client-Hints shape (Chromium-only, not in TS DOM libs). */
interface UADataBrand {
  brand: string;
  version: string;
}
interface NavigatorUAData {
  brands: UADataBrand[];
  platform: string;
}

/**
 * True when running in a browser-like environment with a `navigator`.
 * webgpu-radar is browser-only by design; callers (probe()) use this to fail
 * fast with an actionable message instead of crashing on `navigator` access.
 */
export function isBrowserEnvironment(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.userAgent === "string";
}

/**
 * Map a userAgentData.platform value OR a raw UA string to our canonical OS
 * slug — the same substrings disambiguate both ("macOS"/"Macintosh" share
 * "mac", etc.). Order matters: Android UAs contain "Linux"; iOS tokens must
 * win over "mac". iPadOS 13+ masquerades as desktop Safari ("Macintosh")
 * but is the only "mac" with multi-touch — the standard disambiguation
 * heuristic (real Macs report maxTouchPoints 0).
 */
function osFrom(s: string): string {
  const p = s.toLowerCase();
  if (p.includes("android")) return "android";
  if (/iphone|ipad|ipod|ios/.test(p)) return "ios";
  if (p.includes("mac")) {
    return typeof navigator !== "undefined" && navigator.maxTouchPoints > 1 ? "ios" : "macos";
  }
  if (p.includes("win")) return "windows";
  if (p.includes("cros") || p.includes("linux")) return "linux";
  return "unknown";
}

/** Extract "Name/1.2.3" → "1.2" (major.minor is enough for quirk ranges). */
function versionAfter(ua: string, token: string): string {
  const m = ua.match(new RegExp(`${token}[/ ](\\d+(?:[._]\\d+)?)`, "i"));
  return m?.[1]?.replace("_", ".") ?? "";
}

function fromUserAgentData(
  uaData: NavigatorUAData,
): Pick<EnvironmentInfo, "browser" | "browserVersion"> | null {
  // "Not_A Brand"-style GREASE entries must be ignored; match known brands
  // by slug substring ("edge" ⊂ "Microsoft Edge"). Specific brands before
  // "chromium" so Edge/Chrome/Brave win over the base engine brand.
  for (const slug of ["edge", "opera", "brave", "chrome", "chromium", "firefox", "safari"]) {
    const hit = uaData.brands.find((b) => b.brand.toLowerCase().includes(slug));
    if (hit) return { browser: slug, browserVersion: hit.version };
  }
  return null;
}

// [detect token → slug, version token]. Order matters: every Chromium UA
// also contains "Chrome" and "Safari", iOS ports use their own tokens
// (CriOS/FxiOS/EdgiOS), and real Safari alone carries "Version/x.y".
// "Edge?" covers both modern "Edg/" and legacy "Edge/".
const UA_BROWSERS: ReadonlyArray<readonly [detect: string, slug: string, version: string]> = [
  ["EdgiOS", "edge", "EdgiOS"],
  ["EdgA", "edge", "EdgA"],
  ["Edg", "edge", "Edge?"],
  ["OPR", "opera", "OPR"],
  ["SamsungBrowser", "samsung", "SamsungBrowser"],
  ["FxiOS", "firefox", "FxiOS"],
  ["Firefox", "firefox", "Firefox"],
  ["CriOS", "chrome", "CriOS"],
  ["Chrome", "chrome", "Chrome"],
  ["Safari", "safari", "Version"],
];

function browserFromUserAgent(ua: string): Pick<EnvironmentInfo, "browser" | "browserVersion"> {
  for (const [detect, slug, version] of UA_BROWSERS) {
    if (new RegExp(`${detect}e?/`, "i").test(ua)) {
      return { browser: slug, browserVersion: versionAfter(ua, version) };
    }
  }
  return { browser: "unknown", browserVersion: "" };
}

/**
 * Best-effort environment detection for quirk matching and reports.
 * Never throws; unknown fields come back as "unknown" / "".
 */
export function detectEnvironment(): EnvironmentInfo {
  if (!isBrowserEnvironment()) {
    return { browser: "unknown", browserVersion: "", os: "unknown" };
  }
  const ua = navigator.userAgent;
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;

  const fromHints = uaData ? fromUserAgentData(uaData) : null;
  const { browser, browserVersion } = fromHints ?? browserFromUserAgent(ua);
  // userAgentData.platform can be empty on some Chromium builds; fall back.
  const os = osFrom(uaData?.platform || ua);
  return { browser, browserVersion, os: os === "unknown" ? osFrom(ua) : os };
}
