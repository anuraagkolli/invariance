import { describe, it, expect } from "vitest";
import { compile } from "../src/compile/index.js";
import { SHADCN_CAN } from "../src/manifest/index.js";
import { parseSpec } from "../src/spec/index.js";
import type { StyleSpec } from "../src/spec/index.js";

const can = SHADCN_CAN;

// Parse each canned draft through the WALL (parseSpec), exactly as the pipeline would, so the
// golden output is the truth the data plane ships. parseSpec returns a discriminated result.
function draftFrom(json: unknown): StyleSpec {
  const r = parseSpec(json, can);
  if (!r.ok) throw new Error(`fixture failed the wall: ${JSON.stringify(r.failures)}`);
  return r.spec;
}

const CASES: Array<{ name: string; json: unknown }> = [
  { name: "empty-base", json: {} },
  // SHADCN_CAN locks "primary", so we recolor "destructive" (an unlocked seed) instead.
  { name: "destructive-recolor", json: { colors: { destructive: "oklch(0.55 0.2 20)" } } },
  { name: "neutral-resurface", json: { colors: { neutral: "oklch(0.45 0.02 250)" } } },
  { name: "radius-bump", json: { radius: 12 } },
  // full-rebrand: accent + destructive only (primary is locked in SHADCN_CAN).
  { name: "full-rebrand", json: { colors: { accent: "oklch(0.7 0.12 160)", destructive: "oklch(0.55 0.22 25)" } } },
];

describe("compile golden files (format-contract + profile-number regression net, §8)", () => {
  for (const c of CASES) {
    it(`serializes ${c.name} byte-stably`, async () => {
      const out = compile(draftFrom(c.json), can);
      // canonical-stable JSON: sorted keys, so a golden diff is a real change, not key reordering.
      const stable = JSON.stringify(out, Object.keys(flatten(out)).sort(), 2);
      await expect(stable).toMatchFileSnapshot(`./__golden__/${c.name}.json`);
    });
  }

  it("compile is deterministic — same input twice is byte-identical", () => {
    const d = draftFrom({ colors: { destructive: "oklch(0.55 0.2 20)" } });
    expect(JSON.stringify(compile(d, can))).toBe(JSON.stringify(compile(d, can)));
  });
});

// flatten produces a key set for the stable-stringify replacer (deterministic key ordering).
function flatten(obj: unknown, prefix = "", acc: Record<string, true> = {}): Record<string, true> {
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj as Record<string, unknown>)) {
      acc[k] = true;
      flatten((obj as Record<string, unknown>)[k], `${prefix}${k}.`, acc);
    }
  }
  return acc;
}
