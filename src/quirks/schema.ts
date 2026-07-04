/**
 * Quirks database schema.
 *
 * A quirk is a known browser/GPU/OS-specific WebGPU bug that feature
 * detection and benchmarks can miss. Entries live in db.json (kept
 * comment-free because it ships inside the bundle) and are
 * community-maintained via pull requests — see CONTRIBUTING.md.
 *
 * db.json rules: every entry must match this schema, carry a verifiedDate
 * (the ISO date someone actually reproduced it), and ideally a sourceUrl
 * to an upstream bug tracker. Do not add entries you have not verified —
 * a wrong quirk entry is worse than a missing one, because developers act
 * on it.
 */

export interface QuirkMatch {
  /** "safari" | "chrome" | "firefox" | "edge" | ... Undefined = wildcard. */
  browser?: string;
  /** "ios" | "macos" | "windows" | "android" | "linux". Undefined = wildcard. */
  os?: string;
  /** e.g. ">=26.0", "<141". Undefined = wildcard. */
  browserVersionRange?: string;
  /** GPU vendor as reported by the adapter, e.g. "apple", "nvidia". */
  gpuVendor?: string;
}

export interface QuirkEntry {
  /** Stable slug, e.g. "safari-macos-compute-timeout". */
  id: string;
  match: QuirkMatch;
  /** "blocking" forces tier down to webgpu-limited; "warning" is informational. */
  severity: "blocking" | "warning";
  summary: string;
  workaround?: string;
  sourceUrl?: string;
  /** ISO date the entry was last verified against a real environment. */
  verifiedDate: string;
}
