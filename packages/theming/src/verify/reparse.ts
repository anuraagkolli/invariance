// packages/theming/src/verify/reparse.ts
import { parse, converter } from 'culori';
import type { Oklch } from '../spec/index.js';
import type { Space } from '../manifest/index.js';

const toOklch = converter('oklch');

// Reconstruct a CSS-parseable string from a possibly-bare emitted value. The compiler's
// Shape:"triple" emits a bare channel triple ("0 0% 100%") whose channel space is `space`; we
// wrap it back into the function form so culori can parse it. Function-shaped values already
// carry their wrapper, so a value that already starts with a known function is passed through.
function toParseableCss(value: string, space: Space): string {
  const v = value.trim();
  if (v.length === 0) return v;
  // Already a CSS function call or hex / keyword — parse as-is.
  if (/^[a-zA-Z-]+\(/.test(v) || v.startsWith('#')) return v;
  // Bare triple: wrap per the declared space. null space (raw/number) is not a color → return as-is
  // (culori will fail to parse a bare number, which is the correct "not a color" signal).
  if (space === 'hsl') return `hsl(${v})`;
  if (space === 'rgb') return `rgb(${v})`;
  if (space === 'oklch') return `oklch(${v})`;
  return v;
}

export function reparseToOklch(value: string, space: Space): Oklch | null {
  const css = toParseableCss(value, space);
  if (css.length === 0) return null;
  const parsed = parse(css);
  if (!parsed) return null;
  const ok = toOklch(parsed);
  if (!ok) return null;
  return {
    l: typeof ok.l === 'number' ? ok.l : 0,
    c: typeof ok.c === 'number' ? ok.c : 0,
    h: typeof ok.h === 'number' ? ok.h : NaN,
  };
}
