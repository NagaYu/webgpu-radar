import { describe, expect, it } from "vitest";

// Phase 0 smoke test: the module graph loads and stubs are wired.
// Real unit tests land in Phase 5 (with logic from Phases 1-3).
describe("scaffold smoke", () => {
  it("root entry loads and exposes probe()", async () => {
    const mod = await import("../../src/index.js");
    expect(typeof mod.probe).toBe("function");
    expect(typeof mod.generateReport).toBe("function");
  });

  it("quirks db has the expected shape", async () => {
    const db = await import("../../src/quirks/db.json");
    expect(Array.isArray(db.default.entries)).toBe(true);
  });
});
