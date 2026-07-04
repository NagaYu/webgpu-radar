import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { generateReport, probe } from "webgpu-radar";

/** Probe once on mount; re-render when the result lands. */
function useWebGpuTier() {
  const [state, setState] = useState({ status: "probing", result: null });
  useEffect(() => {
    let cancelled = false;
    probe() // quick mode; pass { mode: "full" } for the deeper probes
      .then((result) => !cancelled && setState({ status: "done", result }))
      .catch((error) => !cancelled && setState({ status: "error", error }));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

function App() {
  const { status, result } = useWebGpuTier();

  if (status === "probing") return <p>Probing WebGPU capability…</p>;
  if (status === "error") return <p>probe() failed — are you in a browser?</p>;

  const useGpu = result.tier === "webgpu-full";
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 640, margin: "3rem auto" }}>
      <h1>
        Tier: <code>{result.tier}</code>
      </h1>
      <p>
        {useGpu
          ? "This device earns the full in-browser AI experience."
          : "Falling back (small models / WASM / hosted API)."}
      </p>
      <ul>
        {result.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(generateReport(result).markdown)}
      >
        Copy shareable report
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
