/**
 * Quirks matcher: pure logic, no I/O. Given the detected environment and a
 * quirks database, return every entry whose `match` block is satisfied.
 * An undefined field in `match` is a wildcard (matches anything) — entries
 * should be as narrow as the verified evidence allows, no narrower.
 */
import type { EnvironmentInfo } from "../tiers/types.js";
import type { QuirkEntry } from "./schema.js";

/** Environment fields a quirk can match on. */
export interface QuirkTarget extends EnvironmentInfo {
  /** adapter.info.vendor, "" when unavailable. */
  gpuVendor: string;
}

/**
 * Compare dotted version strings numerically, segment by segment
 * ("26.10" > "26.9", missing segments are 0). Returns -1 | 0 | 1.
 * Non-numeric segments compare as 0 — quirk ranges should stick to
 * numeric major[.minor[.patch]] forms.
 */
function compareVersions(a: string, b: string): number {
  const as = a.split(".").map((s) => Number.parseInt(s, 10) || 0);
  const bs = b.split(".").map((s) => Number.parseInt(s, 10) || 0);
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const d = (as[i] ?? 0) - (bs[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Minimal range grammar, whitespace-separated AND clauses:
 *   ">=26" | "<141" | ">=26 <27" | "=118" | "118" (bare = exact)
 * Returns false for an empty detected version (can't verify → don't match;
 * a false negative is safer than a false-positive quirk downgrade).
 */
export function versionSatisfies(version: string, range: string): boolean {
  if (!version) return false;
  const clauses = range.trim().split(/\s+/);
  for (const clause of clauses) {
    const m = clause.match(/^(>=|<=|>|<|=)?(\d+(?:\.\d+)*)$/);
    if (!m) return false; // malformed range: never match; caught by db tests
    const op = m[1] ?? "=";
    const bound = m[2] as string;
    const cmp = compareVersions(version, bound);
    const ok =
      (op === ">=" && cmp >= 0) ||
      (op === "<=" && cmp <= 0) ||
      (op === ">" && cmp > 0) ||
      (op === "<" && cmp < 0) ||
      (op === "=" && cmp === 0);
    if (!ok) return false;
  }
  return true;
}

/** undefined = wildcard; otherwise case-insensitive exact match. */
function fieldMatches(want: string | undefined, have: string): boolean {
  return want === undefined || want.toLowerCase() === have.toLowerCase();
}

function entryMatches(target: QuirkTarget, entry: QuirkEntry): boolean {
  const m = entry.match;
  return (
    fieldMatches(m.browser, target.browser) &&
    fieldMatches(m.os, target.os) &&
    fieldMatches(m.gpuVendor, target.gpuVendor) &&
    (m.browserVersionRange === undefined ||
      versionSatisfies(target.browserVersion, m.browserVersionRange))
  );
}

/** Return all database entries matching the target environment. */
export function matchQuirks(target: QuirkTarget, entries: readonly QuirkEntry[]): QuirkEntry[] {
  return entries.filter((entry) => entryMatches(target, entry));
}
