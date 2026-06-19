// packages/client/src/theming/scan-sdk/css-text.ts
/**
 * Deterministic CSS rule-text tokenizer for the scan SDK. The browser's CSSOM
 * is the source of truth (spec §5), but DOM shims used in tests drop values
 * they cannot fully parse (e.g. hsl(var(--x))), so the SDK reads each rule's
 * raw text (CSSStyleRule.cssText, or fixture sheet strings in tests) and parses
 * declarations + var() use-sites here. Flat (non-nested) blocks only — custom
 * properties and theme consumption never nest.
 */

export type RuleBlock = {
  selector: string;
  declarations: Array<{ property: string; value: string }>;
};

const RULE = /([^{}]+)\{([^{}]*)\}/g;
const DECL = /([-A-Za-z][-A-Za-z0-9]*)\s*:\s*([^;]+)(?:;|$)/g;
const CUSTOM_PROP = /^--[A-Za-z0-9_-]+$/;

export function parseRuleBlocks(cssText: string): RuleBlock[] {
  const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: RuleBlock[] = [];
  for (const rule of stripped.matchAll(RULE)) {
    const selector = rule[1]!.trim();
    const body = rule[2]!;
    const declarations: Array<{ property: string; value: string }> = [];
    for (const decl of body.matchAll(DECL)) {
      declarations.push({ property: decl[1]!.trim(), value: decl[2]!.trim() });
    }
    out.push({ selector, declarations });
  }
  return out;
}

export function collectCustomPropDecls(
  blocks: RuleBlock[],
): Array<{ name: string; selector: string; value: string }> {
  const out: Array<{ name: string; selector: string; value: string }> = [];
  for (const block of blocks) {
    for (const d of block.declarations) {
      if (CUSTOM_PROP.test(d.property)) {
        out.push({ name: d.property, selector: block.selector, value: d.value });
      }
    }
  }
  return out;
}

// For a declaration *value* that references one or more vars at the top level,
// return one use-site per referenced var. The use-site is the WRAPPING token
// containing the var() call: a wrapping function captures its whole call text;
// a bare var() captures just "var(--x)".
function useSitesFor(value: string): Array<{ name: string; useSite: string }> {
  const out: Array<{ name: string; useSite: string }> = [];
  // Find each var(--name ...) occurrence and the wrapping function token around it.
  const VAR = /var\(\s*(--[A-Za-z0-9_-]+)[^)]*\)/g;
  for (const m of value.matchAll(VAR)) {
    const name = m[1]!;
    const idx = m.index ?? 0;
    // Walk left from the var() to find the OUTERMOST enclosing function call. The emit
    // obligation is dictated by the function the var ultimately sits inside at the top
    // level — e.g. for "color-mix(in srgb, hsl(var(--ring)) 50%, transparent)" the
    // obligation is color-mix (no single space), NOT the inner hsl. So we find the
    // outermost function whose balanced call text still contains this var().
    const outer = outermostEnclosingFn(value, idx);
    if (!outer) {
      out.push({ name, useSite: m[0] }); // bare var() — no wrapping function
      continue;
    }
    out.push({ name, useSite: outer });
  }
  return out;
}

// Find the OUTERMOST function-call token that encloses the var() at varIdx. Scans every
// "fn(" before varIdx, captures its balanced call text, and keeps the widest call that
// still spans varIdx. Returns null when the var() is at the top level (bare var()).
function outermostEnclosingFn(value: string, varIdx: number): string | null {
  const FN = /([A-Za-z][A-Za-z-]*)\(/g;
  let best: string | null = null;
  let bestStart = Infinity;
  for (const fm of value.matchAll(FN)) {
    const fnStart = fm.index ?? 0;
    if (fnStart >= varIdx) break; // the call must OPEN before the var()
    // Skip the var() call itself (its "var(" opener is at varIdx).
    if (fm[1]!.toLowerCase() === "var" && fnStart === varIdx) continue;
    const { text, end } = captureBalanced(value, fnStart);
    // Does this balanced call actually contain the var()?
    if (end > varIdx && fnStart < bestStart) {
      best = text;
      bestStart = fnStart;
    }
  }
  return best;
}

// From the index of a function name, return its balanced "<fn>( … )" text and the index
// just past its closing paren.
function captureBalanced(value: string, fnStart: number): { text: string; end: number } {
  let depth = 0;
  let i = value.indexOf("(", fnStart);
  const start = fnStart;
  for (; i < value.length; i++) {
    if (value[i] === "(") depth++;
    else if (value[i] === ")") {
      depth--;
      if (depth === 0) return { text: value.slice(start, i + 1).trim(), end: i + 1 };
    }
  }
  return { text: value.slice(start).trim(), end: value.length };
}

export function collectVarUseSites(
  blocks: RuleBlock[],
): Array<{ name: string; selector: string; property: string; useSite: string }> {
  const out: Array<{ name: string; selector: string; property: string; useSite: string }> = [];
  for (const block of blocks) {
    for (const d of block.declarations) {
      if (CUSTOM_PROP.test(d.property)) continue; // a declaration, not a consumption
      for (const site of useSitesFor(d.value)) {
        out.push({
          name: site.name,
          selector: block.selector,
          property: d.property,
          useSite: site.useSite,
        });
      }
    }
  }
  return out;
}
