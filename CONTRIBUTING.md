# Contributing to webgpu-radar

Thanks for helping! The single most valuable contribution is a **verified quirks-database entry** — that's the community mechanism this project is built around, so it comes first.

## Contributing a quirk

A *quirk* is a browser/OS/GPU-specific WebGPU bug that feature detection and benchmarks can miss (wrong compute results, device loss under real workloads, pathological behavior behind a working API).

### The easy path (no code)

1. On the affected machine, open the [live demo](https://nagayu.github.io/webgpu-radar/) and click **Copy report** (or call `generateReport()` in your app).
2. Open a [quirk report issue](https://github.com/NagaYu/webgpu-radar/issues/new?template=quirk-report.yml) and paste the report, plus what you expected vs. what happened.
3. If you know the upstream bug (crbug / WebKit Bugzilla / Mozilla), link it — that's what makes an entry verifiable.

The report contains only browser family + version, OS family, GPU vendor/architecture, and benchmark numbers. No UA string, no fingerprinting data, and it never leaves your machine until you paste it.

### The PR path

Add an entry to [`src/quirks/db.json`](src/quirks/db.json) matching the schema in [`src/quirks/schema.ts`](src/quirks/schema.ts):

```jsonc
{
  "id": "safari-ios-example-slug",          // stable, descriptive slug
  "match": {                                 // omitted fields = wildcard
    "browser": "safari",                     // as detectEnvironment() reports it
    "os": "ios",
    "browserVersionRange": ">=26 <27",       // comparators: >= <= > < = (AND, space-separated)
    "gpuVendor": "apple"                     // as adapter.info.vendor reports it
  },
  "severity": "blocking",                    // "blocking" forces webgpu-limited; "warning" is informational
  "summary": "One sentence a developer can act on.",
  "workaround": "Optional: how to avoid it.",
  "sourceUrl": "https://bugs.webkit.org/show_bug.cgi?id=XXXXXX",
  "verifiedDate": "2026-07-04"               // the day YOU reproduced it
}
```

**The review bar** (strict on purpose — a wrong entry misclassifies real users' machines):

- You (or the linked issue reporter) reproduced the problem on real hardware, on the `verifiedDate`.
- The `match` block is as narrow as the evidence allows. Don't wildcard an OS you didn't test.
- `severity: "blocking"` requires the WebGPU path to be genuinely unusable or incorrect — "slower than expected" is what benchmarks are for.
- An upstream `sourceUrl` is strongly preferred. If the upstream bug gets fixed, PRs that *remove* stale entries (or cap their `browserVersionRange`) are just as welcome.

The database ships empty rather than padded — that's deliberate, and it means your first verified entry matters.

## Code contributions

```bash
pnpm install
pnpm run ci        # lint + typecheck + unit tests + build + size gate
pnpm test:browser  # Playwright (build first: pnpm build)
```

Ground rules (see the codebase for precedent):

- **Zero runtime dependencies** in the package; dev dependencies are fine.
- **No telemetry, no network calls, ever.** The report flow is copy/paste by the user, and stays that way.
- The core `import { probe }` bundle must stay **under 5 KB gzip** — CI fails otherwise (`pnpm size` prints the current number).
- Every classification threshold lives in `src/tiers/classify.ts` with a written rationale, and must remain overridable via `ProbeOptions`.
- TypeScript strict; no `any` in public API surfaces.

## What to expect from CI (read before puzzling over numbers)

GitHub Actions runners have **no GPU**. Observed behavior (2026-07):

- **Chromium** (with `--enable-unsafe-webgpu --enable-features=Vulkan`) falls back to **SwiftShader** software WebGPU: `adapter.info` reports `google` / `swiftshader`, matmul measures roughly 1–4 GFLOPS depending on the runner's CPU, and `probe()` correctly classifies it `webgpu-limited`. CI benchmark numbers therefore never resemble real hardware — that's expected, not a regression.
- **Playwright's Firefox and WebKit builds** don't expose WebGPU at all today, so they exercise the WASM fallback path (`wasm-simd`). That's intentional coverage of decision-tree steps 1→5, not a skipped test. Revisit as their automated WebGPU support matures.
- Locally on macOS, Playwright's default *headless shell* Chromium has **no `navigator.gpu` whatsoever** — headed runs get the real GPU. Browser tests assert shape and honesty, never speed, so they pass in every one of these environments.
- WebGPU requires a **secure context**: tests and the demo are served over `http://localhost` (which qualifies); `file://` and opaque origins do not.

## Releases (maintainers)

1. Bump `version` in `package.json` **and** `src/version.ts` (a unit test enforces sync), update `CHANGELOG.md`.
2. `git tag v0.x.y && git push origin v0.x.y` — the release workflow builds, gates, publishes to npm (needs the `NPM_TOKEN` secret), and creates a GitHub release.
