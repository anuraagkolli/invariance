import { AppManifest, type CandidateTheme, compile, parseSpec, SHADCN_CAN, verify } from "@invariance/theming";
import { describe, expect, it } from "vitest";
import { contrast, lightnessPct } from "./_measure.js";

// unlocked, light-only probe manifest so every seed actually moves under compile
const PROBE: AppManifest = AppManifest.parse({
  ...SHADCN_CAN,
  appId: "probe",
  invariants: { ...SHADCN_CAN.invariants, locks: [] },
});
function compileJson(json: unknown): CandidateTheme {
  const p = parseSpec(json, PROBE);
  if (!p.ok) throw new Error(`probe rejected: ${JSON.stringify(p.failures)}`);
  return compile(p.spec, PROBE);
}
/* eslint-disable no-console */

// Assertions below PIN the measured reality (run 2026-06-23) as a regression — they are not a
// hypothesis. If the ramp profile changes and these move, the demo's mechanism assumptions changed.
describe("MECHANISM PROBE — pinned to measured reality", () => {
  it("(a) surfaces are ANCHORED: a mid-L neutral barely moves --background L (100% → 97.8%)", () => {
    const baseL = lightnessPct(compileJson({}).light["--background"]);
    const movedL = lightnessPct(compileJson({ colors: { neutral: "oklch(0.55 0.08 300)" } }).light["--background"]);
    console.log(`[a] background L: base=${baseL}% mid-neutral=${movedL}% → ${movedL > 85 ? "ANCHORED" : "PROPAGATES"}`);
    expect(baseL).toBe(100);
    expect(movedL).toBeGreaterThan(90); // anchored: surface L stays high regardless of neutral → no full-screen contrast beat
  });

  it("(b) a mid-L primary clears AA but FAILS AAA — band oklchL 0.50–0.65 (contrast-via-primary needs AAA)", () => {
    const failsAAA: number[] = [];
    for (const L of [0.45, 0.5, 0.55, 0.6, 0.65]) {
      const t = compileJson({ colors: { primary: `oklch(${L} 0.15 280)` } });
      const r = contrast(t.light["--primary-foreground"], t.light["--primary"]);
      console.log(`[b] primary oklchL=${L} → emittedL=${lightnessPct(t.light["--primary"])}% contrast=${r.toFixed(3)}`);
      expect(r, `L=${L} must clear AA`).toBeGreaterThanOrEqual(4.5); // maximize-contrast fg always clears AA
      if (r < 7) failsAAA.push(L);
    }
    expect(failsAAA).toEqual([0.5, 0.55, 0.6, 0.65]); // the AAA-failing band (0.45 is dark enough to clear AAA)
  });

  it("(c) a saturated neutral DOES reject at AA — on muted-fg/muted (large-text 3:1)", () => {
    const verdict = verify(compileJson({ colors: { neutral: "oklch(0.45 0.18 30)" } }), PROBE);
    const fails = verdict.ok
      ? []
      : verdict.failures.map((f) => `${f.code}:${f.pair ? `${f.pair.fg}/${f.pair.bg}(${f.pair.category})` : f.role ?? ""}`);
    console.log(`[c] saturated neutral @AA ok=${verdict.ok} fails=[${fails.join(", ")}]`);
    expect(verdict.ok).toBe(false); // an AA contrast rejection IS reachable
    if (!verdict.ok) {
      expect(verdict.failures.some((f) => f.code === "contrast_floor" && f.pair?.fg === "muted-fg")).toBe(true);
    }
  });

  it("(d) scripted SUCCESS colors clear AAA in light (tier-independent maximize-contrast)", () => {
    const indigoR = contrast(
      compileJson({ colors: { primary: "oklch(0.35 0.12 270)" } }).light["--primary-foreground"],
      compileJson({ colors: { primary: "oklch(0.35 0.12 270)" } }).light["--primary"],
    );
    const warm = compileJson({ colors: { neutral: "oklch(0.95 0.03 60)" } });
    const warmR = contrast(warm.light["--foreground"], warm.light["--background"]);
    console.log(`[d] dark-indigo=${indigoR.toFixed(3)} warm-surfaces=${warmR.toFixed(3)} (AAA≥7)`);
    expect(indigoR).toBeGreaterThanOrEqual(7); // dark indigo clears AAA in light
    expect(warmR).toBeGreaterThanOrEqual(7); // warm-light surfaces clear AAA in light
  });
});
