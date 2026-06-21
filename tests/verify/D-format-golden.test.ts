import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildArtifact, compile, parseSpec, renderStyleText, verify } from "@invariance/theming";
import { describe, expect, it } from "vitest";
import { SHADCN_CAN } from "./_fixtures.js";

// ════════════════════════════════════════════════════════════════════════════
// GROUP D — FORMAT-CONTRACT GOLDEN NET (the silent-corruption bug)
// shadcn consumes colors as hsl(var(--x)). If a var emitted hex ("#ffffff") instead
// of a bare HSL triple ("0 0% 100%"), hsl(#ffffff) is invalid CSS and the theme
// silently breaks. The emit contract (shape:"triple", space:"hsl") must produce a
// BARE TRIPLE — on the FRESH-serialized path, not just the verbatim-base copy.
// ════════════════════════════════════════════════════════════════════════════

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// "H S% L%" — hue (deg, optional decimals), saturation%, lightness%. No "#", no "hsl(".
const BARE_HSL_TRIPLE = /^-?\d+(\.\d+)?\s+-?\d+(\.\d+)?%\s+-?\d+(\.\d+)?%$/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

function compileJson(json: unknown) {
  const p = parseSpec(json, SHADCN_CAN);
  if (!p.ok) throw new Error(`rejected: ${JSON.stringify(p.failures)}`);
  return compile(p.spec, SHADCN_CAN);
}

describe("D1 — every hsl-triple var emits a BARE TRIPLE (never hex, never wrapped)", () => {
  // neutral-resurface RE-DERIVES the surface/line/foreground closure → exercises emitValue's
  // serialization (not the verbatim-base copy). accent-recolor exercises the brand path.
  for (const draft of [
    { name: "neutral-resurface", json: { colors: { neutral: "oklch(0.45 0.02 250)" } } },
    { name: "accent-recolor", json: { colors: { accent: "oklch(0.7 0.12 160)" } } },
    { name: "empty (verbatim base)", json: {} },
  ]) {
    it(`${draft.name}: hsl vars are bare triples; radius is a plain number`, () => {
      const theme = compileJson(draft.json);
      for (const [varName, def] of Object.entries(SHADCN_CAN.variables)) {
        const value = theme.light[varName];
        if (value === undefined) continue;
        if (def.emit.space === "hsl") {
          expect(value, `${varName} should be a bare HSL triple`).toMatch(BARE_HSL_TRIPLE);
          expect(value.includes("#"), `${varName} must not be hex`).toBe(false);
          expect(value.includes("("), `${varName} must not be a function form`).toBe(false);
        } else if (def.emit.shape === "number") {
          expect(value, `${varName} should be a plain number`).toMatch(PLAIN_NUMBER);
        }
      }
    });
  }

  it("a concrete bare-triple value looks like '222 47% 31%' (sanity)", () => {
    const theme = compileJson({ colors: { neutral: "oklch(0.45 0.05 250)" } });
    const bg = theme.light["--background"];
    expect(bg).toMatch(BARE_HSL_TRIPLE);
    // three tokens, second & third end with %
    const [h, s, l] = bg.split(/\s+/);
    expect(Number.isFinite(parseFloat(h))).toBe(true);
    expect(s.endsWith("%")).toBe(true);
    expect(l.endsWith("%")).toBe(true);
  });
});

describe("D2 — rendered CSS golden (regression net for the emit format)", () => {
  const goldenPath = here("./__fixtures__/D-render-neutral-resurface.css");

  function renderGolden(): string {
    const theme = compileJson({ colors: { neutral: "oklch(0.45 0.02 250)" } });
    const verdict = verify(theme, SHADCN_CAN);
    const artifact = buildArtifact(theme, SHADCN_CAN, verdict);
    return renderStyleText(artifact, "light");
  }

  it("a committed golden exists", () => {
    expect(existsSync(goldenPath), "run scripts/gen to create the golden if missing").toBe(true);
  });

  it("the rendered CSS is byte-identical to the committed golden", () => {
    expect(renderGolden()).toBe(readFileSync(goldenPath, "utf8"));
  });

  it("the golden visibly contains bare triples and no hex / no hsl() wrapper", () => {
    const css = readFileSync(goldenPath, "utf8");
    expect(css).toMatch(/--background: -?\d/); // value starts with a digit (a triple), not '#'
    expect(css.includes("#")).toBe(false);
    expect(css.includes("hsl(")).toBe(false);
    expect(css.startsWith(":root {")).toBe(true);
  });
});
