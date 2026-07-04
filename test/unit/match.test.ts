import { describe, expect, it } from "vitest";
import { matchQuirks, versionSatisfies } from "../../src/quirks/match.js";
import type { QuirkTarget } from "../../src/quirks/match.js";
import type { QuirkEntry } from "../../src/quirks/schema.js";

const target: QuirkTarget = {
  browser: "safari",
  browserVersion: "26.1",
  os: "macos",
  gpuVendor: "apple",
};

function entry(match: QuirkEntry["match"], id = "q"): QuirkEntry {
  return { id, match, severity: "blocking", summary: "s", verifiedDate: "2026-07-02" };
}

describe("versionSatisfies", () => {
  it("handles comparators", () => {
    expect(versionSatisfies("26.1", ">=26")).toBe(true);
    expect(versionSatisfies("26.1", ">26.1")).toBe(false);
    expect(versionSatisfies("26.1", "<=26.1")).toBe(true);
    expect(versionSatisfies("141", "<141")).toBe(false);
    expect(versionSatisfies("140.5", "<141")).toBe(true);
  });

  it("bare version means exact", () => {
    expect(versionSatisfies("26.1", "26.1")).toBe(true);
    expect(versionSatisfies("26.1", "26")).toBe(false);
  });

  it("compares numerically, not lexically", () => {
    expect(versionSatisfies("26.10", ">26.9")).toBe(true);
    expect(versionSatisfies("100", ">=99")).toBe(true);
  });

  it("AND-combines whitespace-separated clauses", () => {
    expect(versionSatisfies("26.5", ">=26 <27")).toBe(true);
    expect(versionSatisfies("27.0", ">=26 <27")).toBe(false);
  });

  it("missing segments count as zero", () => {
    expect(versionSatisfies("26", "26.0")).toBe(true);
    expect(versionSatisfies("26.0.1", ">26")).toBe(true);
  });

  it("empty detected version never matches (fail safe)", () => {
    expect(versionSatisfies("", ">=0")).toBe(false);
  });

  it("malformed range never matches", () => {
    expect(versionSatisfies("26", "^26.0")).toBe(false);
    expect(versionSatisfies("26", "twenty-six")).toBe(false);
  });
});

describe("matchQuirks", () => {
  it("empty match block is a full wildcard", () => {
    expect(matchQuirks(target, [entry({})])).toHaveLength(1);
  });

  it("matches on all four fields together", () => {
    const e = entry({
      browser: "safari",
      os: "macos",
      gpuVendor: "apple",
      browserVersionRange: ">=26",
    });
    expect(matchQuirks(target, [e])).toHaveLength(1);
  });

  it("any mismatching field rejects the entry", () => {
    expect(matchQuirks(target, [entry({ browser: "chrome" })])).toHaveLength(0);
    expect(matchQuirks(target, [entry({ os: "ios" })])).toHaveLength(0);
    expect(matchQuirks(target, [entry({ gpuVendor: "nvidia" })])).toHaveLength(0);
    expect(matchQuirks(target, [entry({ browserVersionRange: "<26" })])).toHaveLength(0);
  });

  it("is case-insensitive on string fields", () => {
    expect(matchQuirks(target, [entry({ browser: "Safari", gpuVendor: "Apple" })])).toHaveLength(1);
  });

  it("unknown gpuVendor ('') only matches vendor wildcards", () => {
    const noVendor = { ...target, gpuVendor: "" };
    expect(matchQuirks(noVendor, [entry({ gpuVendor: "apple" })])).toHaveLength(0);
    expect(matchQuirks(noVendor, [entry({ browser: "safari" })])).toHaveLength(1);
  });

  it("returns every matching entry, in db order", () => {
    const all = matchQuirks(target, [
      entry({}, "a"),
      entry({ browser: "chrome" }, "b"),
      entry({}, "c"),
    ]);
    expect(all.map((e) => e.id)).toEqual(["a", "c"]);
  });
});
