# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-04

### Added

- `probe()` — real WebGPU capability detection: adapter/device acquisition
  (`adapter.info` with legacy fallback), shader-compile and matmul
  micro-benchmarks (quick mode), buffer-bandwidth and empirical
  max-usable-buffer probes (full mode), all timeout-guarded.
- Tier classification (`webgpu-full` / `webgpu-limited` / `wasm-simd` /
  `wasm-basic` / `unsupported`) via a documented decision tree with named,
  measured, overridable thresholds.
- Community quirks database schema + matcher (wildcard fields, version
  ranges); ships empty by design — entries require verified evidence.
- WASM fallback detection (SIMD via module validation, threads via shared
  memory), UA/OS environment parsing (userAgentData-first).
- `generateReport()` — anonymized JSON + issue-template-ready Markdown.
- Integration helpers: `webgpu-radar/webllm` (model recommendation) and
  `webgpu-radar/transformers-js` (device/dtype selection), dependency-free.
- Subpath entries `webgpu-radar/bench` and `webgpu-radar/quirks`.
- Live demo site (GitHub Pages), runnable vanilla/React/WebLLM examples.
- CI: lint, typecheck, 63 unit tests, cross-browser Playwright tests
  (Chromium/Firefox/WebKit), build, and a 5 KB-gzip core size gate.
