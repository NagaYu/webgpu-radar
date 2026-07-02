import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "bench/index": "src/bench/index.ts",
    "quirks/index": "src/quirks/index.ts",
    "integrations/webllm": "src/integrations/webllm.ts",
    "integrations/transformers-js": "src/integrations/transformers-js.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: true,
  target: "es2022",
  platform: "browser",
  treeshake: true,
});
