// ─────────────────────────────────────────────────────────────────────────────
// INDEPENDENT verification oracle.
//
// This module re-derives WCAG contrast and OKLCH chroma from first principles so
// that a verification test never validates the engine's checker by calling the
// engine's checker. It shares NO code with @invariance/theming (in particular it
// does NOT use culori, which the engine uses for both color parsing and
// wcagContrast). All constants come from public standards:
//   - WCAG 2.x relative luminance: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
//   - OKLab/OKLCH: Björn Ottosson, https://bottosson.github.io/posts/oklab/
// ─────────────────────────────────────────────────────────────────────────────

export type Srgb = { r: number; g: number; b: number }; // each channel in [0,1]
export type OklchT = { L: number; C: number; h: number }; // h in degrees [0,360)
export type ColorSpace = "hsl" | "rgb" | "oklch" | null;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

// ── parsing ──────────────────────────────────────────────────────────────────

function splitTriple(body: string): number[] {
  return body
    .trim()
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => parseFloat(t.replace("%", "")));
}

function hexToSrgb(hex: string): Srgb {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function hslToSrgb(h: number, sPct: number, lPct: number): Srgb {
  const s = sPct / 100;
  const l = lPct / 100;
  const hue = ((h % 360) + 360) % 360;
  // standard HSL→RGB
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return { r: rgb[0] + m, g: rgb[1] + m, b: rgb[2] + m };
}

/**
 * Parse an emitted CSS color value to sRGB. For a bare triple ("H S% L%"),
 * `space` declares how to interpret it (the var's manifest emit.space). Function
 * forms ("hsl(...)", "rgb(...)", "oklch(...)") and hex are self-describing.
 */
export function parseToSrgb(value: string, space?: ColorSpace): Srgb {
  const v = value.trim();
  if (v.startsWith("#")) return hexToSrgb(v);

  const fn = /^([a-zA-Z]+)\((.*)\)$/.exec(v);
  if (fn) {
    const name = fn[1].toLowerCase();
    const parts = splitTriple(fn[2]);
    if (name === "hsl" || name === "hsla") return hslToSrgb(parts[0], parts[1], parts[2]);
    if (name === "rgb" || name === "rgba") return { r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255 };
    if (name === "oklch") return oklchToSrgb({ L: parts[0], C: parts[1], h: parts[2] || 0 });
    throw new Error(`oracle: unsupported color function ${name}(`);
  }

  // bare triple — interpret per declared space
  const parts = splitTriple(v);
  if (space === "hsl") return hslToSrgb(parts[0], parts[1], parts[2]);
  if (space === "rgb") return { r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255 };
  if (space === "oklch") return oklchToSrgb({ L: parts[0], C: parts[1], h: parts[2] || 0 });
  throw new Error(`oracle: cannot parse bare triple "${v}" without a declared space`);
}

// ── WCAG luminance + contrast ────────────────────────────────────────────────

function linearizeChannel(c: number): number {
  // WCAG 2.x companding (threshold 0.03928).
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(c: Srgb): number {
  const r = linearizeChannel(clamp01(c.r));
  const g = linearizeChannel(clamp01(c.g));
  const b = linearizeChannel(clamp01(c.b));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(
  a: string,
  b: string,
  spaceA?: ColorSpace,
  spaceB?: ColorSpace,
): number {
  const la = relativeLuminance(parseToSrgb(a, spaceA));
  const lb = relativeLuminance(parseToSrgb(b, spaceB));
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// ── OKLab / OKLCH (Ottosson reference matrices) ──────────────────────────────

function srgbToLinear(c: number): number {
  // sRGB inverse companding (true sRGB threshold 0.04045) — the OKLab pipeline.
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function srgbToOklch(c: Srgb): OklchT {
  const r = srgbToLinear(clamp01(c.r));
  const g = srgbToLinear(clamp01(c.g));
  const b = srgbToLinear(clamp01(c.b));

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

export function oklchToSrgb(color: OklchT): Srgb {
  const hr = (color.h * Math.PI) / 180;
  const A = color.C * Math.cos(hr);
  const B = color.C * Math.sin(hr);
  const L = color.L;

  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return { r: clamp01(linearToSrgb(r)), g: clamp01(linearToSrgb(g)), b: clamp01(linearToSrgb(b)) };
}

/** OKLCH chroma of an emitted color string. */
export function chromaOf(value: string, space?: ColorSpace): number {
  const v = value.trim();
  // For an oklch-emitted value the chroma is carried directly — read it without
  // an sRGB round-trip (avoids gamut-clamp distortion of the measured chroma).
  const fn = /^oklch\((.*)\)$/i.exec(v);
  if (fn) return splitTriple(fn[1])[1];
  if (space === "oklch" && !v.includes("(")) return splitTriple(v)[1];
  return srgbToOklch(parseToSrgb(value, space)).C;
}

// ── required-contrast table (spec §6) — hardcoded, independent of the engine ──

export const REQUIRED_CONTRAST = {
  AA: { text: 4.5, "large-text": 3.0, ui: 3.0 },
  AAA: { text: 7.0, "large-text": 4.5, ui: 3.0 },
} as const;

export function requiredContrastIndep(
  tier: "AA" | "AAA",
  category: "text" | "large-text" | "ui",
): number {
  return REQUIRED_CONTRAST[tier][category];
}
