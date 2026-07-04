# WebLLM integration example

`probe({ mode: "full" })` → `recommendWebLLMModel()` → only then (and only on
an explicit click, since model weights are a ~1 GB download) spin up WebLLM
with the recommended model.

```bash
# build the library first (the example links it via file:../..)
cd ../.. && pnpm install && pnpm build && cd examples/webllm-integration

npm install
npm run dev
# open the printed localhost URL
```

On a `wasm-*`/`unsupported` tier the page shows the "use a hosted API"
recommendation instead of a load button — that decision is the whole point
of the library.
