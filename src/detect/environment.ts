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

/** Map a userAgentData.platform / UA fragment to our canonical OS slug. */
function osFromPlatform(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes("android")) return "android";
  if (p.includes("ios") || p.includes("iphone") || p.includes("ipad")) return "ios";
  if (p.includes("mac")) return "macos";
  if (p.includes("win")) return "windows";
  if (p.includes("linux") || p.includes("cros")) return "linux";
  return "unknown";
}

function osFromUserAgent(ua: string): string {
  // Order matters: Android UAs contain "Linux"; iOS must win over macOS.
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  // iPadOS 13+ masquerades as desktop Safari ("Macintosh") but is the only
  // "macOS" with multi-touch — the standard disambiguation heuristic.
  if (/macintosh/i.test(ua)) {
    if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 1) return "ios";
    return "macos";
  }
  if (/windows/i.test(ua)) return "windows";
  if (/cros|linux/i.test(ua)) return "linux";
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
  // "Not_A Brand"-style GREASE entries must be ignored; match known brands.
  // Check specific brands before "Chromium" so Edge/Chrome win over the base.
  const table: ReadonlyArray<readonly [pattern: RegExp, slug: string]> = [
    [/edge/i, "edge"],
    [/opera/i, "opera"],
    [/brave/i, "brave"],
    [/chrome/i, "chrome"],
    [/chromium/i, "chromium"],
    [/firefox/i, "firefox"],
    [/safari/i, "safari"],
  ];
  for (const [pattern, slug] of table) {
    const hit = uaData.brands.find((b) => pattern.test(b.brand));
    if (hit) return { browser: slug, browserVersion: hit.version };
  }
  return null;
}

function browserFromUserAgent(ua: string): Pick<EnvironmentInfo, "browser" | "browserVersion"> {
  // Order matters: every Chromium UA also contains "Chrome" and "Safari",
  // and iOS ports use their own tokens (CriOS/FxiOS/EdgiOS).
  if (/edgios|edga|edg\//i.test(ua) || /\bedge\//i.test(ua)) {
    return {
      browser: "edge",
      browserVersion:
        versionAfter(ua, "EdgiOS") || versionAfter(ua, "EdgA") || versionAfter(ua, "Edge?"),
    };
  }
  if (/opr\//i.test(ua)) return { browser: "opera", browserVersion: versionAfter(ua, "OPR") };
  if (/samsungbrowser/i.test(ua)) {
    return { browser: "samsung", browserVersion: versionAfter(ua, "SamsungBrowser") };
  }
  if (/fxios/i.test(ua)) return { browser: "firefox", browserVersion: versionAfter(ua, "FxiOS") };
  if (/firefox\//i.test(ua)) {
    return { browser: "firefox", browserVersion: versionAfter(ua, "Firefox") };
  }
  if (/crios/i.test(ua)) return { browser: "chrome", browserVersion: versionAfter(ua, "CriOS") };
  if (/chrome\//i.test(ua))
    return { browser: "chrome", browserVersion: versionAfter(ua, "Chrome") };
  if (/safari\//i.test(ua)) {
    // Real Safari carries "Version/x.y"; Chromium UAs (filtered above) don't.
    return { browser: "safari", browserVersion: versionAfter(ua, "Version") };
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
  const os = uaData?.platform ? osFromPlatform(uaData.platform) : osFromUserAgent(ua);
  // userAgentData.platform can be empty on some Chromium builds; fall back.
  return { browser, browserVersion, os: os === "unknown" ? osFromUserAgent(ua) : os };
}
