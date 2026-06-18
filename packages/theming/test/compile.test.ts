import { describe, it, expect } from "vitest";
import { compile, type CandidateTheme } from "../src/compile/index.js";
import { SHADCN_CAN } from "../src/manifest/index.js";
import { requiredContrast, ivRoles1, getRoleGraph } from "../src/roles/index.js";
import { toOklch, contrast, emitValue } from "../src/compile/oklch.js";
import type { StyleSpec } from "../src/spec/index.js";
import type { EmitContract } from "../src/manifest/index.js";

const can = SHADCN_CAN;

// Map a VarName back to its role via the manifest, for assertions.
function roleVar(role: string): string {
  const entry = Object.entries(can.variables).find(([, v]) => v.role === role);
  if (!entry) throw new Error(`no var for role ${role} in SHADCN_CAN`);
  return entry[0];
}

// Reconstruct a bare emit-verbatim base value into a culori-parseable CSS color string.
// Mirrors the same reconstruction the compiler does internally (Contract #1: no bare-triple→culori throw).
function reconstructBase(raw: string, emit: EmitContract): string {
  if (emit.shape === "triple" && emit.space !== null) {
    return `${emit.space}(${raw})`;
  }
  // shape:"function" or shape:"raw" — already parseable as-is.
  return raw;
}

// Re-serialize a base[mode][role] color value through the SAME emit contract the compiler uses, so
// the base-as-canvas property is checked against the byte-exact value the compiler must reproduce.
// NOTE: reconstructs the bare triple first (Contract #1) before passing to toOklch.
function emitBaseColor(varName: string): string {
  const def = can.variables[varName]!;
  const role = def.role;
  const baseRaw = can.base.light[role]!;
  const parseable = reconstructBase(baseRaw, def.emit);
  return emitValue(toOklch(parseable), def.emit, can.invariants.chromaCap);
}

describe("compile — empty draft is the exact base canvas", () => {
  it("emits every COLOR base[light][role] verbatim through its emit contract for an empty draft", () => {
    const out: CandidateTheme = compile({}, can);
    const graph = getRoleGraph(can.vocabVersion);
    // For an empty draft the affected closure is empty, so every color var must equal its base value
    // re-serialized through the same emit contract (no ramp approximation — the canvas is base).
    for (const [varName, def] of Object.entries(can.variables)) {
      if (graph.roles[def.role]?.kind !== "color") continue;
      if (can.base.light[def.role] === undefined) continue;
      expect(out.light[varName]).toBe(emitBaseColor(varName));
    }
    // background specifically (the surface-anchor) lands on its serialized base.
    const bgVar = roleVar("background");
    expect(out.light[bgVar]).toBe(emitBaseColor(bgVar));
  });

  it("stamps vocab + profile versions in meta", () => {
    const out = compile({}, can);
    expect(out.meta.vocabVersion).toBe(can.vocabVersion);
    expect(out.meta.profileVersion).toBe(can.profileVersion);
  });

  it("does NOT emit a dark block when the manifest is light-only (SHADCN_CAN)", () => {
    const out = compile({}, can);
    expect(can.modes.allowed).not.toContain("dark");
    expect(out.dark).toBeUndefined();
  });

  it("emits a dark block when the manifest allows dark — dark is its OWN ladder, not inverted light", () => {
    // Build a minimal manifest that allows dark, with a dark base that passes AA.
    // We use SHADCN_CAN as the light base and supply a dark base from the iv-profile-1 dark ladder.
    const darkCan = {
      ...can,
      modes: {
        allowed: ["light" as const, "dark" as const],
        default: "light" as const,
        selectors: { light: ":root", dark: ".dark" },
      },
      base: {
        ...can.base,
        // Dark base values (near-black background, near-white foreground) — all pairs pass AA.
        // These are bare HSL triples matching the emit contract (shape:triple, space:hsl).
        dark: {
          background:       "0 0% 9%",         // ~#171717  L≈0.145 in OKLCH
          foreground:       "0 0% 98%",         // ~#fafafa
          card:             "0 0% 12%",         // lift above background
          "card-fg":        "0 0% 98%",
          popover:          "0 0% 12%",
          "popover-fg":     "0 0% 98%",
          primary:          "240 5.9% 20%",     // dark primary
          "primary-fg":     "0 0% 98%",
          secondary:        "240 3.7% 22%",
          "secondary-fg":   "0 0% 98%",
          accent:           "240 3.7% 22%",
          "accent-fg":      "0 0% 98%",
          destructive:      "0 62.8% 50%",
          "destructive-fg": "0 0% 98%",
          muted:            "240 3.7% 22%",
          "muted-fg":       "240 5% 64.9%",
          border:           "240 3.7% 22%",
          input:            "240 3.7% 22%",
          ring:             "240 5.9% 20%",
        },
      },
      // Locks must have base[dark] entries — card is locked and we provided dark.card above
      invariants: {
        ...can.invariants,
        locks: ["card"] as string[],
      },
    };
    const draft: StyleSpec = { colors: { neutral: toOklch("oklch(0.45 0.02 250)") } };
    const out = compile(draft, darkCan);

    expect(out.dark).toBeDefined();
    const bgVar = roleVar("background");
    const lightBg = toOklch(wrap(out.light[bgVar]!, can.variables[bgVar]!.emit));
    const darkBg = toOklch(wrap(out.dark![bgVar]!, can.variables[bgVar]!.emit));
    // The dark anchor-L (ivProfile1.dark.anchorL ≈ 0.145) sits well below the light anchor (≈ 1.0):
    // proves the two ladders are independent, not a single signed delta applied to one base.
    expect(darkBg.l).toBeLessThan(lightBg.l);
    expect(darkBg.l).toBeLessThan(0.3);
  });
});

describe("compile — a set seed re-derives only its closure; untouched surfaces stay byte-identical to an empty compile", () => {
  it("setting primary leaves background byte-identical but changes ring (transitive)", () => {
    const baseOut = compile({}, can);
    const draft: StyleSpec = { colors: { primary: toOklch("oklch(0.55 0.2 20)") } };
    const out = compile(draft, can);
    const bgVar = roleVar("background");
    const ringVar = roleVar("ring");
    expect(out.light[bgVar]).toBe(baseOut.light[bgVar]); // untouched surface unchanged
    expect(out.light[ringVar]).not.toBe(baseOut.light[ringVar]); // ring re-derived off new primary
  });
});

describe("compile — contrast holds on the candidate it produces", () => {
  it("every text contrastPair clears the AA floor in light for a recolor draft", () => {
    const draft: StyleSpec = { colors: { primary: toOklch("oklch(0.7 0.15 250)") } };
    const out = compile(draft, can);
    for (const pair of ivRoles1.contrastPairs.filter((p) => p.category === "text")) {
      const fgVar = roleVar(pair.fg);
      const bgVar = roleVar(pair.bg);
      if (out.light[fgVar] === undefined || out.light[bgVar] === undefined) continue;
      const fg = toOklch(wrap(out.light[fgVar]!, can.variables[fgVar]!.emit));
      const bg = toOklch(wrap(out.light[bgVar]!, can.variables[bgVar]!.emit));
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(requiredContrast("AA", "text") - 0.05);
    }
  });
});

describe("compile — locked roles are written last, verbatim from base", () => {
  it("a derived-role lock pins that var to its serialized base even when its seed moves", () => {
    // build a manifest variant that locks the `card` derived role.
    const locked = { ...can, invariants: { ...can.invariants, locks: ["card"] } };
    const draft: StyleSpec = { colors: { neutral: toOklch("oklch(0.4 0.02 250)") } };
    const out = compile(draft, locked);
    const cardVar = roleVar("card");
    const baseOut = compile({}, locked);
    expect(out.light[cardVar]).toBe(baseOut.light[cardVar]); // pinned verbatim
  });
});

describe("compile — base-reconstruction path (bare-triple manifests compile without throwing)", () => {
  it("compiles SHADCN_CAN (bare HSL triples in base) without throwing", () => {
    // Contract #1: base values are emit-verbatim (bare HSL triple for shadcn); compile must
    // reconstruct hsl(<triple>) before calling toOklch — NOT pass the bare triple to culori.
    expect(() => compile({}, can)).not.toThrow();
    expect(() => compile({ colors: { neutral: toOklch("oklch(0.5 0.01 220)") } }, can)).not.toThrow();
  });
});

describe("compile — purity (same inputs → byte-identical output)", () => {
  it("two calls with identical inputs produce byte-identical output", () => {
    const draft: StyleSpec = { colors: { primary: toOklch("oklch(0.55 0.2 20)"), neutral: toOklch("oklch(0.45 0.02 250)") } };
    const out1 = compile(draft, can);
    const out2 = compile(draft, can);
    expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
  });

  it("empty-draft purity", () => {
    const out1 = compile({}, can);
    const out2 = compile({}, can);
    expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
  });
});

// helper: a triple emit must be wrapped back into a parseable color for the contrast assertion.
function wrap(value: string, emit: { shape: string; space: string | null }): string {
  if (emit.space === null) return value;
  if (emit.shape === "function") return value;
  // triple → wrap in the space function
  if (emit.space === "hsl") return `hsl(${value})`;
  if (emit.space === "rgb") return `rgb(${value})`;
  return `oklch(${value})`;
}
