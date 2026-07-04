# Vanilla example

`probe()` + a tier gate in one `<script type="module">` — no build step.

```bash
# from the repository root
pnpm install && pnpm build
node scripts/serve.mjs
# open http://localhost:8787/examples/vanilla/
```

It imports `../../dist/index.js` (the locally built bundle). In your own app,
install the package and import normally:

```js
import { probe } from "webgpu-radar";
```
