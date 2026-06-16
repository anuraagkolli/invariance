/**
 * Variable discovery (governed-theming onboarding, Phase 1).
 *
 * Statically collect a vendor app's declared CSS custom properties from built
 * CSS. MVP is static-from-CSS-text (deterministic, testable, no browser); a
 * runtime getComputedStyle reader is a later, preferred mode (deferred).
 */

/** One declared CSS custom property, with the selector scope it was declared in. */
export interface DiscoveredVar {
  /** Custom property name, e.g. "--primary". */
  name: string;
  /** Declared value, verbatim, e.g. "#4F46E5" or "0.5rem". */
  value: string;
  /** Selector the declaration lived under, e.g. ":root" or ".dark". */
  scope: string;
}

// Match `selector { ... }` rule blocks. Custom-property declarations don't nest,
// so a flat (non-nested) block match is all MVP discovery needs.
const RULE = /([^{}]+)\{([^{}]*)\}/g;
// Match `--name: value;` declarations inside a block.
const DECL = /(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g;

/**
 * Collect every custom-property declaration in `css`, one entry per
 * (scope, name), in declaration order. Comments are stripped first so
 * commented-out declarations are not discovered.
 */
export function discoverVars(css: string): DiscoveredVar[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: DiscoveredVar[] = [];
  for (const rule of stripped.matchAll(RULE)) {
    const scope = rule[1]!.trim();
    const body = rule[2]!;
    for (const decl of body.matchAll(DECL)) {
      out.push({ name: decl[1]!, value: decl[2]!.trim(), scope });
    }
  }
  return out;
}
