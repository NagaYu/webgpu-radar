# React example

A `useWebGpuTier()` hook wrapping `probe()`, driving a render-time gate.

```bash
# build the library first (the example links it via file:../..)
cd ../.. && pnpm install && pnpm build && cd examples/react

npm install
npm run dev
# open the printed localhost URL
```

Note: `probe()` runs real GPU work (~100ms quick mode) — call it once and
cache the result (as the hook does), don't re-probe on every render/route.
