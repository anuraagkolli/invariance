// A short, human-readable phrase describing a theme's design INTENT — what it
// set (e.g. "dark · vivid amber accent · standard contrast · rounded corners"),
// not its 38 compiled token values. Ported from @invariance/design's
// style-summary so the Console stays decoupled from the design plane; operates
// on the opaque theme doc the Themes view already loads.

export interface StyleSpecLike {
  mode?: string;
  accentHue?: number;
  accentChroma?: string;
  contrast?: string;
  typography?: string;
  radius?: string;
  density?: string;
}

// Coarse hue → colour-name buckets (upper bound, exclusive).
const HUE_NAMES: ReadonlyArray<readonly [number, string]> = [
  [20, "red"],
  [45, "orange"],
  [70, "amber"],
  [105, "lime"],
  [150, "green"],
  [195, "teal"],
  [230, "sky"],
  [265, "blue"],
  [295, "indigo"],
  [325, "violet"],
  [350, "magenta"],
  [360, "red"],
];

function hueLabel(h: number): string {
  const x = ((h % 360) + 360) % 360;
  for (const [upper, name] of HUE_NAMES) if (x < upper) return name;
  return "red";
}

/** Human-readable design-intent phrase. Defensive about missing fields (the
 * theme doc is opaque and older versions may omit a styleSpec field). */
export function summarizeStyleSpec(spec: StyleSpecLike): string {
  const parts: string[] = [];
  if (spec.mode) parts.push(spec.mode);
  if (typeof spec.accentHue === "number") {
    parts.push([spec.accentChroma, hueLabel(spec.accentHue), "accent"].filter(Boolean).join(" "));
  }
  if (spec.contrast) parts.push(`${spec.contrast} contrast`);
  if (spec.typography && spec.typography !== "standard") parts.push(`${spec.typography} type`);
  if (spec.radius && spec.radius !== "subtle") parts.push(`${spec.radius} corners`);
  if (spec.density && spec.density !== "standard") parts.push(`${spec.density} density`);
  return parts.join(" · ");
}

/** Pull the StyleSpec out of an opaque design-plane v2 theme doc
 * (`theme.theme.styleSpec`); null when absent or not StyleSpec-shaped. */
export function styleSpecOf(theme: Record<string, unknown> | null | undefined): StyleSpecLike | null {
  const spec = (theme as { theme?: { styleSpec?: unknown } } | null | undefined)?.theme?.styleSpec;
  if (spec && typeof spec === "object" && typeof (spec as StyleSpecLike).accentHue === "number") {
    return spec as StyleSpecLike;
  }
  return null;
}
