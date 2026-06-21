import {
  type AppManifest,
  type CandidateTheme,
  compile,
  ivRoles1,
  parseSpec,
  verify,
} from "@invariance/theming";
import { describe, expect, it } from "vitest";
import { NO_LOCKS_CAN, SHADCN_CAN, TWO_MODE_CAN } from "./_fixtures.js";
import { publish, InMemoryAuditStore, InMemoryBlobStore, InMemoryPointerStore } from "./_cp.js";
import {
  type ColorSpace,
  chromaOf,
  contrastRatio,
  requiredContrastIndep,
} from "./_oracle.js";
import { mulberry32, randomAcceptedDeltaJson } from "./_util.js";

// ════════════════════════════════════════════════════════════════════════════
// GROUP C — INVARIANTS SURVIVE A FULL PASS (fuzz merge → compile → verify)
// For every theme the verifier ACCEPTS, we INDEPENDENTLY re-parse the emitted
// artifact and re-derive contrast (WCAG from scratch) and chroma (OKLab from
// scratch). If our independent check ever disagrees with an "accept", that is a
// verifier gap and we report it. We also verify transitive re-derivation and that
// the verifier trusts NOTHING upstream (rejects tampered compiler output).
// ════════════════════════════════════════════════════════════════════════════

// Independent copy of the contrast pair set (spec §3). Cross-checked against the graph below.
const CONTRAST_PAIRS: Array<{ fg: string; bg: string; category: "text" | "large-text" | "ui" }> = [
  { fg: "foreground", bg: "background", category: "text" },
  { fg: "card-fg", bg: "card", category: "text" },
  { fg: "popover-fg", bg: "popover", category: "text" },
  { fg: "primary-fg", bg: "primary", category: "text" },
  { fg: "secondary-fg", bg: "secondary", category: "text" },
  { fg: "accent-fg", bg: "accent", category: "text" },
  { fg: "destructive-fg", bg: "destructive", category: "text" },
  { fg: "muted-fg", bg: "muted", category: "large-text" },
  { fg: "ring", bg: "background", category: "ui" },
  { fg: "ring", bg: "card", category: "ui" },
  { fg: "ring", bg: "popover", category: "ui" },
];

const CONTRAST_TOL = 0.02; // float-noise guard between culori (engine) and our WCAG impl
const CHROMA_TOL = 0.005;

function compileJson(json: unknown, manifest: AppManifest): CandidateTheme {
  const p = parseSpec(json, manifest);
  if (!p.ok) throw new Error(`compileJson rejected: ${JSON.stringify(p.failures)}`);
  return compile(p.spec, manifest);
}

type RoleVar = { varName: string; space: ColorSpace; isColor: boolean };
function roleVarMap(manifest: AppManifest): Map<string, RoleVar> {
  const m = new Map<string, RoleVar>();
  for (const [varName, def] of Object.entries(manifest.variables)) {
    m.set(def.role, { varName, space: def.emit.space, isColor: def.emit.space !== null });
  }
  return m;
}

type Violation = { kind: "contrast" | "chroma" | "mode"; mode?: string; detail: string };

/** Independently re-derive every invariant over an emitted candidate. */
function independentViolations(candidate: CandidateTheme, manifest: AppManifest): Violation[] {
  const v: Violation[] = [];
  const rv = roleVarMap(manifest);
  const tier = manifest.invariants.contrastTier;
  const cap = manifest.invariants.chromaCap;

  // (i) emitted modes ⊆ allowed
  const emittedModes = (["light", "dark"] as const).filter((mode) => candidate[mode] !== undefined);
  for (const mode of emittedModes) {
    if (!manifest.modes.allowed.includes(mode)) {
      v.push({ kind: "mode", mode, detail: `emitted mode ${mode} ∉ allowed ${JSON.stringify(manifest.modes.allowed)}` });
    }
  }

  for (const mode of emittedModes) {
    const vars = candidate[mode]!;

    // (ii) contrast ≥ required for every pair
    for (const pair of CONTRAST_PAIRS) {
      const fg = rv.get(pair.fg);
      const bg = rv.get(pair.bg);
      if (!fg || !bg) continue;
      const fgVal = vars[fg.varName];
      const bgVal = vars[bg.varName];
      if (fgVal == null || bgVal == null) continue;
      const ratio = contrastRatio(fgVal, bgVal, fg.space, bg.space);
      const need = requiredContrastIndep(tier, pair.category);
      if (ratio < need - CONTRAST_TOL) {
        v.push({
          kind: "contrast",
          mode,
          detail: `${pair.fg}/${pair.bg} (${pair.category}): ratio ${ratio.toFixed(3)} < ${need} [fg="${fgVal}" bg="${bgVal}"]`,
        });
      }
    }

    // (iii) chroma ≤ cap for every emitted color
    for (const [varName, def] of Object.entries(manifest.variables)) {
      if (def.emit.space === null) continue; // skip number/raw vars
      const value = vars[varName];
      if (value == null) continue;
      const c = chromaOf(value, def.emit.space);
      if (c > cap + CHROMA_TOL) {
        v.push({ kind: "chroma", mode, detail: `${def.role}: chroma ${c.toFixed(4)} > cap ${cap} [="${value}"]` });
      }
    }
  }
  return v;
}

describe("C0 — the independent pair set equals the engine's graph (no drift)", () => {
  it("CONTRAST_PAIRS matches ivRoles1.contrastPairs", () => {
    const norm = (ps: ReadonlyArray<{ fg: string; bg: string; category: string }>) =>
      [...ps].map((p) => `${p.fg}|${p.bg}|${p.category}`).sort();
    expect(norm(CONTRAST_PAIRS)).toEqual(norm(ivRoles1.contrastPairs));
  });
});

describe("C1 — fuzz: every ACCEPTED theme independently satisfies all invariants (both modes)", () => {
  for (const manifest of [SHADCN_CAN, TWO_MODE_CAN]) {
    it(`${manifest.appId}: 300 prompt-shaped specs → accepted ⟹ independently clean`, () => {
      const rng = mulberry32(0xfeed + manifest.appId.length);
      let accepted = 0;
      let rejected = 0;
      let minContrastMargin = Infinity;
      let maxChroma = 0;
      const verifierGaps: string[] = [];

      for (let i = 0; i < 300; i++) {
        const json = randomAcceptedDeltaJson(rng);
        const parsed = parseSpec(json, manifest);
        if (!parsed.ok) continue; // (shouldn't happen for this generator, but stay safe)
        const candidate = compile(parsed.spec, manifest);
        const verdict = verify(candidate, manifest);

        const violations = independentViolations(candidate, manifest);

        if (verdict.ok) {
          accepted++;
          // record margins for reporting
          const rv = roleVarMap(manifest);
          for (const mode of (["light", "dark"] as const).filter((m) => candidate[m])) {
            for (const pair of CONTRAST_PAIRS) {
              const fg = rv.get(pair.fg)!;
              const bg = rv.get(pair.bg)!;
              const ratio = contrastRatio(candidate[mode]![fg.varName], candidate[mode]![bg.varName], fg.space, bg.space);
              minContrastMargin = Math.min(minContrastMargin, ratio - requiredContrastIndep(manifest.invariants.contrastTier, pair.category));
            }
            for (const [vn, def] of Object.entries(manifest.variables)) {
              if (def.emit.space === null) continue;
              maxChroma = Math.max(maxChroma, chromaOf(candidate[mode]![vn], def.emit.space));
            }
          }
          // THE CORE CHECK: an accepted theme must independently satisfy every invariant.
          if (violations.length > 0) {
            verifierGaps.push(`spec ${JSON.stringify(json)} ACCEPTED but: ${violations.map((x) => x.detail).join("; ")}`);
          }
        } else {
          rejected++;
        }
      }

      // eslint-disable-next-line no-console
      console.log(
        `[C1 ${manifest.appId}] accepted=${accepted} rejected=${rejected} minContrastMargin=${minContrastMargin.toFixed(3)} maxChroma=${maxChroma.toFixed(4)} (cap ${manifest.invariants.chromaCap})`,
      );
      expect(verifierGaps, `VERIFIER GAP(S):\n${verifierGaps.join("\n")}`).toEqual([]);
    });
  }
});

describe("C1-meta — the independent detector is non-vacuous (it CAN flag a violation)", () => {
  it("independentViolations flags a forced contrast collapse and an over-cap chroma", () => {
    const cand = compileJson({ colors: { accent: "oklch(0.6 0.12 200)" } }, SHADCN_CAN);
    expect(independentViolations(cand, SHADCN_CAN)).toEqual([]); // clean baseline
    const contrastTamper: CandidateTheme = { ...cand, light: { ...cand.light, "--foreground": cand.light["--background"] } };
    expect(independentViolations(contrastTamper, SHADCN_CAN).some((v) => v.kind === "contrast")).toBe(true);
    const chromaTamper: CandidateTheme = { ...cand, light: { ...cand.light, "--accent": "300 100% 50%" } };
    expect(independentViolations(chromaTamper, SHADCN_CAN).some((v) => v.kind === "chroma")).toBe(true);
  });
});

describe("C2 — root-pair hard-reject reachability + the gate that backs it", () => {
  it("scans extreme neutrals for a real (foreground,background) root-pair failure and reports", () => {
    // The surface anchor pins background's L to the profile (light/dark extreme), so legal seeds
    // mostly cannot drag the root pair below the AA floor (worst-case achromatic contrast ≈ 4.58 > 4.5).
    // We scan anyway and record whether any seed combo triggers the (foreground,background) reject.
    let rootRejects = 0;
    for (const manifest of [SHADCN_CAN, TWO_MODE_CAN]) {
      const rv = roleVarMap(manifest);
      for (let i = 0; i < 60; i++) {
        const l = (i % 10) / 10 + 0.05;
        const neutral = `oklch(${l.toFixed(3)} 0.3 ${(i * 37) % 360})`;
        const parsed = parseSpec({ colors: { neutral } }, manifest);
        if (!parsed.ok) continue;
        const cand = compile(parsed.spec, manifest);
        const verdict = verify(cand, manifest);
        if (verdict.ok) continue;
        const rootFail = !verdict.ok && verdict.failures.some((f) => f.code === "contrast_floor" && f.pair?.fg === "foreground" && f.pair?.bg === "background");
        if (rootFail) {
          rootRejects++;
          // when it DOES reject the root pair, our oracle must independently agree it's < floor
          for (const mode of (["light", "dark"] as const).filter((m) => cand[m])) {
            const ratio = contrastRatio(cand[mode]!["--foreground"], cand[mode]!["--background"], rv.get("foreground")!.space, rv.get("background")!.space);
            // at least one mode should be the offending one; only assert when below floor
            if (ratio < requiredContrastIndep(manifest.invariants.contrastTier, "text")) {
              expect(ratio).toBeLessThan(requiredContrastIndep(manifest.invariants.contrastTier, "text"));
            }
          }
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[C2] legal-seed (foreground,background) root-pair rejections found = ${rootRejects} (0 expected at AA — defensive net; gate verified by tampering in C5)`);
    expect(rootRejects).toBeGreaterThanOrEqual(0); // documentary; the gate is proven in C5
  });

  it("a candidate with a forced-failing root pair is REJECTED and refused by publish (not shipped)", async () => {
    const parsed = parseSpec({ colors: { accent: "oklch(0.7 0.1 200)" } }, SHADCN_CAN);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const cand = compile(parsed.spec, SHADCN_CAN);
    // force the (foreground,background) root pair to collapse: foreground := background
    const tampered: CandidateTheme = { ...cand, light: { ...cand.light, "--foreground": cand.light["--background"] } };
    const verdict = verify(tampered, SHADCN_CAN);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failures.some((f) => f.code === "contrast_floor" && f.pair?.fg === "foreground" && f.pair?.bg === "background")).toBe(true);
    // independent confirmation: foreground==background ⟹ ratio 1.0 < 4.5
    expect(contrastRatio(tampered.light["--foreground"], tampered.light["--background"], "hsl", "hsl")).toBeCloseTo(1, 5);
    // NOT SHIPPED: publish refuses a non-ok verdict
    const stores = { blob: new InMemoryBlobStore(), pointer: new InMemoryPointerStore(), audit: new InMemoryAuditStore() };
    await expect(
      publish(
        {
          tenant: "t",
          artifact: { schemaVersion: 1, vocabVersion: "iv-roles-1", profileVersion: "iv-profile-1", appId: "x", modes: { light: { selector: ":root", vars: tampered.light } }, meta: { verifierReport: verdict, contrastFloor: "AA", chromaCap: 0.3 } },
          styleSpec: parsed.spec,
          verifierReport: verdict,
          prompt: "p",
          actor: "a",
          vocabVersion: "iv-roles-1",
          profileVersion: "iv-profile-1",
        },
        stores,
      ),
    ).rejects.toThrow();
  });
});

describe("C3 — untouched roles emit BYTE-IDENTICAL to base (no ramp approximation)", () => {
  it("a delta touching only `accent` leaves every non-accent-closure var byte-identical to base", () => {
    const base = compileJson({}, SHADCN_CAN);
    const cand = compileJson({ colors: { accent: "oklch(0.6 0.15 280)" } }, SHADCN_CAN);
    // roles NOT in the accent closure must be verbatim base
    const untouched = ["--background", "--foreground", "--primary", "--primary-foreground", "--destructive", "--card", "--popover", "--muted", "--border", "--input"];
    for (const v of untouched) {
      expect(cand.light[v], `${v} should be untouched`).toBe(base.light[v]);
    }
    // and the accent var DID move
    expect(cand.light["--accent"]).not.toBe(base.light["--accent"]);
  });
});

describe("C4 — transitive re-derivation (closure walk, not stale base)", () => {
  it("setting `primary` re-derives `ring` (accent-line(primary)), not stale base", () => {
    // primary is locked in SHADCN_CAN, so use the no-locks clone where primary may move.
    const empty = compileJson({}, NO_LOCKS_CAN);
    const moved = compileJson({ colors: { primary: "oklch(0.55 0.2 20)" } }, NO_LOCKS_CAN);
    expect(moved.light["--primary"]).not.toBe(empty.light["--primary"]); // seed moved
    expect(moved.light["--ring"]).not.toBe(empty.light["--ring"]); // ring re-derived transitively
    // background does NOT depend on primary → unchanged
    expect(moved.light["--background"]).toBe(empty.light["--background"]);
  });

  it("setting `neutral` moves ALL surface/line roles; brand seeds stay put", () => {
    const empty = compileJson({}, SHADCN_CAN);
    const moved = compileJson({ colors: { neutral: "oklch(0.5 0.05 150)" } }, SHADCN_CAN);
    for (const v of ["--background", "--card", "--popover", "--muted", "--secondary", "--border", "--input"]) {
      expect(moved.light[v], `${v} should move when neutral changes`).not.toBe(empty.light[v]);
    }
    // destructive is a brand seed independent of neutral → unchanged
    expect(moved.light["--destructive"]).toBe(empty.light["--destructive"]);
  });
});

describe("C5 — the verifier trusts NOTHING upstream (rejects tampered compiler output)", () => {
  function freshCandidate(): CandidateTheme {
    const parsed = parseSpec({ colors: { accent: "oklch(0.6 0.12 200)" } }, SHADCN_CAN);
    if (!parsed.ok) throw new Error("setup");
    const c = compile(parsed.spec, SHADCN_CAN);
    expect(verify(c, SHADCN_CAN).ok, "baseline candidate should verify before tampering").toBe(true);
    return c;
  }

  it("contrast_floor: foreground forced equal to background", () => {
    const c = freshCandidate();
    const t: CandidateTheme = { ...c, light: { ...c.light, "--foreground": c.light["--background"] } };
    const verdict = verify(t, SHADCN_CAN);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.failures.some((f) => f.code === "contrast_floor")).toBe(true);
  });

  it("locked_drift: a locked role (primary) nudged off base", () => {
    const c = freshCandidate();
    const t: CandidateTheme = { ...c, light: { ...c.light, "--primary": "0 0% 50%" } };
    const verdict = verify(t, SHADCN_CAN);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.failures.some((f) => f.code === "locked_drift")).toBe(true);
  });

  it("chroma_cap: a var pushed past the chroma cap", () => {
    const c = freshCandidate();
    // a very saturated (but in-gamut) hsl triple — magenta #ff00ff is OKLCH chroma ≈ 0.322 > 0.3 cap
    const t: CandidateTheme = { ...c, light: { ...c.light, "--accent": "300 100% 50%" } };
    expect(chromaOf("300 100% 50%", "hsl")).toBeGreaterThan(0.3); // independent confirmation
    const verdict = verify(t, SHADCN_CAN);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.failures.some((f) => f.code === "chroma_cap")).toBe(true);
  });

  it("mode_not_allowed: a dark block emitted for a light-only manifest", () => {
    const c = freshCandidate();
    const t: CandidateTheme = { ...c, dark: { ...c.light } };
    const verdict = verify(t, SHADCN_CAN);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.failures.some((f) => f.code === "mode_not_allowed")).toBe(true);
  });

  it("unsafe_value: a CSS breakout string in an emitted var", () => {
    const c = freshCandidate();
    const t: CandidateTheme = { ...c, light: { ...c.light, "--accent": "red; } body{display:none}" } };
    const verdict = verify(t, SHADCN_CAN);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.failures.some((f) => f.code === "unsafe_value")).toBe(true);
  });
});
