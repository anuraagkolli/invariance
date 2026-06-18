import {
  converter,
  clampChroma,
  inGamut,
  formatHsl,
  formatRgb,
  wcagContrast,
  parse,
  type Oklch as CuloriOklch,
} from "culori";
import type { Oklch } from "../spec/index.js";
import type { EmitContract } from "../manifest/index.js";

const toCuloriOklch = converter("oklch");
const toHsl = converter("hsl");
const toRgb = converter("rgb");
const inSrgb = inGamut("rgb");

/**
 * Below this OKLCH chroma a color is treated as achromatic: its hue is undefined, so converting to
 * hsl/rgb yields a garbage hue + a floating-point ghost saturation (e.g. white → "300 0.5% 100%").
 * Pinning s=0/h=0 in that regime makes white serialize to the byte-stable "0 0% 100%" the emit
 * contract and golden files require.
 */
const ACHROMATIC_EPS = 1e-4;

/** Parse any CSS color string to a clamped-chroma OKLCH object. Throws on unparseable. */
export function toOklch(cssValue: string): Oklch {
  const parsed = parse(cssValue);
  if (!parsed) throw new Error(`unparseable color: ${cssValue}`);
  const o = toCuloriOklch(parsed);
  return { l: o.l ?? 0, c: o.c ?? 0, h: o.h ?? 0 };
}

function asCulori(o: Oklch): CuloriOklch {
  return { mode: "oklch", l: o.l, c: o.c, h: o.h };
}

/** WCAG 2.0 contrast ratio between two OKLCH colors. */
export function contrast(a: Oklch, b: Oklch): number {
  return wcagContrast(asCulori(a), asCulori(b));
}

/** Move fg's L one step toward `towardL`, holding C/H, clamped to [0,1]. */
export function stepFgL(fg: Oklch, towardL: number, step: number): Oklch {
  const dir = towardL >= fg.l ? 1 : -1;
  const l = Math.min(1, Math.max(0, fg.l + dir * step));
  return { l, c: fg.c, h: fg.h };
}

function round(n: number, precision: number): number {
  const f = 10 ** precision;
  return Math.round(n * f) / f;
}

function fmt(n: number, precision: number): string {
  // fixed precision, then strip trailing zeros so "8.000" → "8" and "0.50" → "0.5".
  return String(round(n, precision));
}

/** Gamut-map ON CONVERT, but only when needed: an already-in-sRGB color is returned untouched so
 * clampChroma never perturbs an in-gamut value (byte-stability for golden files). */
function gamutMapSrgb(capped: CuloriOklch): CuloriOklch {
  return inSrgb(capped) ? capped : (clampChroma(capped, "rgb") as CuloriOklch);
}

/**
 * Map an OKLCH color (or a number carried in `.l` for dimension roles) to a serialized string
 * per the emit contract, with gamut-map ON CONVERT (clampChroma) for color spaces. Near-achromatic
 * colors pin s/h to 0 so white serializes byte-stably (no floating-point ghost hue/saturation).
 */
export function emitValue(color: Oklch, emit: EmitContract, chromaCap: number): string {
  // Dimension/number roles: the px value rides in `.l`; no color space.
  if (emit.shape === "number" || emit.space === null) {
    return fmt(color.l, emit.precision);
  }

  // Clamp chroma to the cap first (the chroma cap is its own invariant, applied pre-gamut-map).
  const cappedChroma = Math.min(color.c, chromaCap);
  const achromatic = cappedChroma <= ACHROMATIC_EPS;
  const capped: CuloriOklch = { mode: "oklch", l: color.l, c: cappedChroma, h: color.h };

  switch (emit.space) {
    case "oklch": {
      // oklch reads l/c/h directly — no hue/sat round-trip, so no ghost-hue handling needed; just
      // gamut-map chroma into sRGB so the emitted value is renderable.
      const g = clampChroma(capped, "oklch") as CuloriOklch;
      const l = fmt(g.l ?? 0, emit.precision);
      const c = fmt(g.c ?? 0, emit.precision);
      const h = fmt(achromatic ? 0 : g.h ?? 0, emit.precision);
      if (emit.shape === "function") return `oklch(${l} ${c} ${h})`;
      return `${l} ${c} ${h}`; // triple
    }
    case "hsl": {
      // hsl rides sRGB: gamut-map (only if out of gamut), read back as hsl, pin s/h when achromatic.
      const g = gamutMapSrgb(capped);
      const hsl = toHsl(g);
      const h = fmt(achromatic ? 0 : hsl.h ?? 0, emit.precision);
      const s = fmt(achromatic ? 0 : (hsl.s ?? 0) * 100, emit.precision);
      const l = fmt((hsl.l ?? 0) * 100, emit.precision);
      if (emit.shape === "function") return formatHsl(g);
      return `${h} ${s}% ${l}%`; // triple
    }
    case "rgb": {
      const g = gamutMapSrgb(capped);
      const rgb = toRgb(g);
      const r = Math.round((rgb.r ?? 0) * 255);
      const gg = Math.round((rgb.g ?? 0) * 255);
      const b = Math.round((rgb.b ?? 0) * 255);
      if (emit.shape === "function") return formatRgb(g);
      return `${r} ${gg} ${b}`; // triple
    }
    default:
      // exhaustiveness guard: Space ∈ {hsl, rgb, oklch, null}; null handled above.
      throw new Error(`unhandled emit space: ${String(emit.space)}`);
  }
}
