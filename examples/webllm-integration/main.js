import { probe } from "webgpu-radar";
import { recommendWebLLMModel } from "webgpu-radar/webllm";

const out = document.getElementById("out");
const go = document.getElementById("go");

// Full mode: the max-buffer probe feeds the model-size veto.
const result = await probe({ mode: "full" });
const rec = recommendWebLLMModel(result);

out.textContent = [
  `tier: ${result.tier}`,
  `recommendation: ${rec.action}${rec.modelId ? ` → ${rec.modelId}` : ""}`,
  ...rec.reasons.map((r) => `  - ${r}`),
].join("\n");

if (rec.action === "webgpu") {
  go.hidden = false;
  go.addEventListener("click", async () => {
    go.disabled = true;
    // Loaded lazily so simply opening the example never downloads a model.
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
    const engine = await CreateMLCEngine(rec.modelId, {
      initProgressCallback: (p) => {
        out.textContent = `loading ${rec.modelId}: ${p.text}`;
      },
    });
    const reply = await engine.chat.completions.create({
      messages: [{ role: "user", content: "Say hello from an in-browser LLM in one sentence." }],
    });
    out.textContent = reply.choices[0]?.message?.content ?? "(no reply)";
  });
} else {
  out.textContent += "\n\n→ this device should call a hosted API instead of running WebLLM.";
}
