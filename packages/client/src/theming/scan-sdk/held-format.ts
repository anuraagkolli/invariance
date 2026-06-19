// packages/client/src/theming/scan-sdk/held-format.ts
/**
 * Pure string classifiers for the scan SDK. No DOM, no I/O — deterministic.
 * `heldFormat` is the cross-check; `wrapping` is the consumption obligation;
 * `mode` is inferred from the declaring selector (spec §5).
 */

export type HeldFormat =
  | "hsl-triple"
  | "rgb-triple"
  | "hex"
  | "oklch"
  | "number"
  | "keyword"
  | "unknown";

export type Wrapping = "hsl" | "rgb" | "oklch" | "raw" | "color-mix" | "other";

export type ScanMode = "light" | "dark" | "unknown";

const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
// "<num> <num>% <num>%" — HSL channels held as a bare triple (H, S%, L%).
const HSL_TRIPLE = /^-?\d*\.?\d+\s+-?\d*\.?\d+%\s+-?\d*\.?\d+%$/;
// "<num> <num> <num>" — RGB channels held as a bare triple (0–255, no %).
const RGB_TRIPLE = /^\d*\.?\d+\s+\d*\.?\d+\s+\d*\.?\d+$/;
// a single dimension/number leaf: "0", "0.5rem", "8px", "1.25", "50%"
const NUMBER = /^-?\d*\.?\d+(?:px|rem|em|%)?$/;
// a CSS named color / global keyword we treat as a keyword leaf.
const KEYWORDS = new Set([
  "transparent",
  "currentcolor",
  "white",
  "black",
  "inherit",
  "initial",
  "unset",
  "none",
]);

export function classifyHeldFormat(rawValue: string): HeldFormat {
  const v = rawValue.trim();
  if (HEX.test(v)) return "hex";
  if (/^oklch\(/i.test(v)) return "oklch";
  if (HSL_TRIPLE.test(v)) return "hsl-triple";
  if (RGB_TRIPLE.test(v)) return "rgb-triple";
  if (NUMBER.test(v)) return "number";
  if (KEYWORDS.has(v.toLowerCase())) return "keyword";
  return "unknown";
}

export function classifyWrapping(useSite: string): Wrapping {
  const v = useSite.trim().toLowerCase();
  if (/^color-mix\(/.test(v)) return "color-mix";
  if (/^hsl\(\s*var\(/.test(v)) return "hsl";
  if (/^rgb\(\s*var\(/.test(v)) return "rgb";
  if (/^oklch\(\s*var\(/.test(v)) return "oklch";
  // A bare var() reference with no wrapping function around it.
  if (/^var\(/.test(v)) return "raw";
  return "other";
}

export function modeFromSelector(selector: string): ScanMode {
  const s = selector.trim().toLowerCase();
  if (/(\.dark\b|\[data-theme\s*=\s*['"]?dark['"]?\]|prefers-color-scheme:\s*dark)/.test(s)) {
    return "dark";
  }
  if (s === ":root" || s === "html" || s === "html:root" || s === ":root, html" || s === "*") {
    return "light";
  }
  return "unknown";
}
