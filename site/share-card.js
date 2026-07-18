/**
 * Shareable result card rendering for the demo site.
 *
 * Draws a ProbeResult onto a <canvas> as a branded, social-ready image.
 * Zero dependencies, system fonts only, fully offline. Privacy stance is the
 * same as src/report.ts: the card shows ONLY fields that already exist in
 * ProbeResult — never the raw UA, screen metrics, locale, or anything else
 * that inches toward fingerprinting.
 */

/** Canonical demo URL — where a shared link should send people. */
export const SITE_URL = "https://nagayu.github.io/webgpu-radar/";

/** Human-facing form of SITE_URL for the card footer. */
const SITE_URL_TEXT = "nagayu.github.io/webgpu-radar";

/** Keep in sync with the :root palette in site/index.html. */
const COLORS = {
  bg: "#0b0e14",
  panel: "#131722",
  text: "#e6e9f0",
  muted: "#8b93a7",
  line: "#232a3b",
  accent: "#5eead4",
  tiers: {
    "webgpu-full": "#34d399",
    "webgpu-limited": "#fbbf24",
    "wasm-simd": "#60a5fa",
    "wasm-basic": "#60a5fa",
    unsupported: "#f87171",
  },
};

export const CARD_SIZES = {
  social: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "ui-sans-serif, system-ui, -apple-system, sans-serif";

function hexToRgba(hex, alpha) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Truncate text with an ellipsis so it fits within maxWidth at the current font. */
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/** Pick the hero stat: matmul GFLOPS, else shader-compile ms, else nothing ran. */
function heroStat(result) {
  const matmul = result.benchmarks.matmul;
  if (matmul?.ok) {
    return {
      value: matmul.value.gflops.toFixed(1),
      unit: "GFLOPS",
      label: `matmul throughput (N=${matmul.value.size})`,
    };
  }
  const compile = result.benchmarks.shaderCompile;
  if (compile?.ok) {
    return { value: compile.value.ms.toFixed(1), unit: "ms", label: "shader compile (cold)" };
  }
  return { value: "—", unit: "", label: "no GPU benchmark ran" };
}

function gpuLine(result) {
  return result.gpu
    ? `${result.gpu.vendor || "?"} / ${result.gpu.architecture || "?"}`
    : "no adapter";
}

function envLine(result) {
  const e = result.environment;
  return `${e.browser} ${e.browserVersion || "?"} · ${e.os}`;
}

/** One short line for the tweet intent. Kept well under 200 chars. */
export function shareText(result) {
  const where = result.gpu?.vendor
    ? `on my ${result.gpu.vendor} GPU`
    : `in ${result.environment.browser}`;
  const matmul = result.benchmarks.matmul;
  const compile = result.benchmarks.shaderCompile;
  const bench = matmul?.ok
    ? `, ${matmul.value.gflops.toFixed(1)} GFLOPS matmul`
    : compile?.ok
      ? `, shader compile ${compile.value.ms.toFixed(1)} ms`
      : "";
  return `WebGPU ${where}: tier ${result.tier}${bench} — probed with webgpu-radar #WebGPU`.slice(
    0,
    200,
  );
}

/** Full X (Twitter) web-intent URL for this result. */
export function shareIntentUrl(result) {
  const text = encodeURIComponent(shareText(result));
  const url = encodeURIComponent(SITE_URL);
  return `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
}

/** Concentric radar rings + a sweep line — the brand motif, kept subtle. */
function drawRadarMotif(ctx, cx, cy, maxRadius) {
  ctx.save();
  ctx.strokeStyle = hexToRgba(COLORS.accent, 0.08);
  ctx.lineWidth = 2;
  for (let r = maxRadius / 5; r <= maxRadius; r += maxRadius / 5) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const sweep = -Math.PI / 5;
  ctx.strokeStyle = hexToRgba(COLORS.accent, 0.18);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + maxRadius * Math.cos(sweep), cy + maxRadius * Math.sin(sweep));
  ctx.stroke();
  ctx.fillStyle = hexToRgba(COLORS.accent, 0.5);
  ctx.beginPath();
  ctx.arc(
    cx + maxRadius * 0.62 * Math.cos(sweep),
    cy + maxRadius * 0.62 * Math.sin(sweep),
    6,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
}

function drawTierPill(ctx, tier, x, y, fontPx) {
  const color = COLORS.tiers[tier] ?? COLORS.muted;
  ctx.font = `600 ${fontPx}px ${MONO}`;
  const textWidth = ctx.measureText(tier).width;
  const padX = fontPx * 0.7;
  const h = fontPx * 1.9;
  ctx.fillStyle = hexToRgba(color, 0.16);
  ctx.beginPath();
  ctx.roundRect(x, y, textWidth + padX * 2, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(tier, x + padX, y + h / 2 + fontPx * 0.06);
  ctx.textBaseline = "alphabetic";
  return { width: textWidth + padX * 2, height: h };
}

/**
 * Per-size layout constants. Everything is in CSS pixels of the target
 * bitmap (the canvas is sized 1:1 — these are export images, not UI).
 */
const LAYOUTS = {
  social: {
    wordmarkY: 112,
    pillY: 168,
    pillFont: 42,
    heroBaseline: 430,
    heroFont: 150,
    heroUnitFont: 46,
    heroLabelY: 486,
    infoY: 548,
    footerY: 584,
    ringCenter: [1042, 158],
    ringRadius: 320,
  },
  square: {
    wordmarkY: 128,
    pillY: 196,
    pillFont: 46,
    heroBaseline: 600,
    heroFont: 170,
    heroUnitFont: 52,
    heroLabelY: 664,
    infoY: 806,
    footerY: 1022,
    ringCenter: [920, 190],
    ringRadius: 380,
  },
};

/**
 * Render `result` as a branded card into `canvas` at the given size
 * ("social" 1200×630 or "square" 1080×1080). Returns the canvas.
 */
export function renderShareCard(result, sizeKey, canvas) {
  const { width, height } = CARD_SIZES[sizeKey];
  const L = LAYOUTS[sizeKey];
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const left = 72;
  const contentWidth = width - left * 2;

  // Background + panel frame.
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.beginPath();
  ctx.roundRect(24, 24, width - 48, height - 48, 28);
  ctx.fillStyle = COLORS.panel;
  ctx.fill();
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Radar motif, clipped to the panel so rings never bleed over the frame.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(25, 25, width - 50, height - 50, 27);
  ctx.clip();
  drawRadarMotif(ctx, L.ringCenter[0], L.ringCenter[1], L.ringRadius);
  ctx.restore();

  // Wordmark: a small radar dot + the library name.
  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(left + 12, L.wordmarkY - 14, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(COLORS.accent, 0.45);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(left + 12, L.wordmarkY - 14, 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `600 40px ${MONO}`;
  ctx.fillStyle = COLORS.accent;
  ctx.fillText("webgpu-radar", left + 42, L.wordmarkY);

  // Tier pill + probe meta beside it.
  const pill = drawTierPill(ctx, result.tier, left, L.pillY, L.pillFont);
  ctx.font = `400 26px ${SANS}`;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(
    `${result.mode} probe · ${Math.round(result.durationMs)}ms`,
    left + pill.width + 28,
    L.pillY + pill.height / 2 + 9,
  );

  // Hero stat.
  const hero = heroStat(result);
  ctx.font = `700 ${L.heroFont}px ${MONO}`;
  ctx.fillStyle = COLORS.text;
  ctx.fillText(hero.value, left, L.heroBaseline);
  const heroWidth = ctx.measureText(hero.value).width;
  if (hero.unit) {
    ctx.font = `700 ${L.heroUnitFont}px ${MONO}`;
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(hero.unit, left + heroWidth + 24, L.heroBaseline);
  }
  ctx.font = `400 28px ${SANS}`;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(hero.label, left, L.heroLabelY);

  // GPU + environment, one muted mono line.
  ctx.font = `500 30px ${MONO}`;
  ctx.fillStyle = COLORS.text;
  ctx.fillText(
    fitText(ctx, `${gpuLine(result)} · ${envLine(result)}`, contentWidth),
    left,
    L.infoY,
  );

  // Footer: demo URL left, privacy note right.
  ctx.font = `500 24px ${MONO}`;
  ctx.fillStyle = hexToRgba(COLORS.accent, 0.8);
  ctx.fillText(SITE_URL_TEXT, left, L.footerY);
  ctx.font = `400 22px ${SANS}`;
  ctx.fillStyle = COLORS.muted;
  const privacy = "runs locally · no telemetry";
  ctx.fillText(privacy, width - left - ctx.measureText(privacy).width, L.footerY);

  return canvas;
}
