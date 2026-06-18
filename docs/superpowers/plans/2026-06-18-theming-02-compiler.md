# Theming Compiler + Ramp Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, deterministic `@invariance/theming/profile` (the mode-indexed `iv-profile-1` ramp numbers) and `@invariance/theming/compile` (`compile(draft, manifest) → CandidateTheme`) — the transitive-closure expansion, contrast repair, separate-dark generation, and emit-contract serialization with gamut-map-on-convert.

**Architecture:** The ramp profile is the "numbers" leg of the three-way cut (graph=relationships, profile=numbers, manifest=policy): one golden-fileable file holding per-mode anchor-L, surface/line step ladders, optional per-mode seed nudges, foreground search step, and radius offsets. The compiler is a pure consumer of the role graph (Plan 01), the ramp profile (this plan), and the manifest (Plan 01): it walks the transitive derivation closure over seeds present in the draft, topologically re-derives affected roles in OKLCH, repairs contrast (fg moves / bg held / seeds fixed; minimum-legible stops at floor, maximize-contrast goes to the extreme; ring is the lone multi-pair repair; root-pair hard-reject), generates dark on its own ladder, then maps + serializes each role per its `emit` contract with gamut-map-on-convert at fixed precision, writing locked roles last verbatim from base.

**Tech Stack:** TypeScript (strict, ESM), zod, culori v4 (OKLCH parse/convert, `clampChroma` gamut-map, `wcagContrast`, `formatHex`/`formatHsl`/`formatRgb`), vitest.

## Global Constraints

- pnpm workspaces + turborepo; pnpm ONLY (never npm/yarn).
- TypeScript strict, ESM (`"type": "module"`). Workspace packages export TS source directly (`"exports": { ".": "./src/index.ts" }`); no build step.
- zod is the source of truth: export both `XSchema` and `type X = z.infer<typeof XSchema>`. Cross-schema integrity lives in `superRefine` blocks.
- vitest; tests colocated under each package's `test/`. Run e.g. `pnpm -F @invariance/theming test`.
- OKLCH color math via culori (parse, convert, gamut-map, WCAG contrast).
- Artifact content-addressing + signing: ed25519 via `node:crypto`, canonical JSON (sorted keys).
- DETERMINISM: `compile()`/`verify()`/`renderStyleText()`/`mergeDelta()`/`diffSpecs()` must be pure — no `Date.now()`, `Math.random()`, or I/O. Stamp timestamps outside the pure core.
- Package layout (exact paths this plan touches):
  - `packages/theming/` (`@invariance/theming`) — pure, plane-agnostic deterministic core, ESM, exports TS source directly.
    - `src/roles/` RoleGraph types + the `iv-roles-1` instance + `requiredContrast` (Plan 01; consumed here).
    - `src/manifest/` AppManifest zod schema + superRefine + `SHADCN_CAN` fixture (Plan 01; consumed here).
    - `src/spec/` StyleSpec zod schema, `OklchColor`, `Oklch`, `FontStackId`, `parseSpec` (Plan 01; consumed here).
    - `src/profile/` ramp profile types + the `iv-profile-1` profile — THE NUMBERS (**this plan**).
    - `src/compile/` `compile(draft, manifest) → CandidateTheme` (**this plan**).
    - `src/index.ts` barrel re-export (**this plan extends it**).

---

## File Structure

| Path | Responsibility |
|---|---|
| `packages/theming/src/profile/index.ts` | `RampProfile`/`ModeProfile` types, `PROFILE_VERSION`, the `ivProfile1` value (THE NUMBERS), and `getRampProfile(profileVersion)` lookup. |
| `packages/theming/test/profile.test.ts` | Profile shape/completeness invariants + `getRampProfile` lookup/throw. |
| `packages/theming/src/compile/oklch.ts` | Internal OKLCH helpers: `toOklch`, `contrast`, `stepFgL`, and `emitValue` (map OKLCH → `emit` space with gamut-map-on-convert at fixed precision). Not exported from barrel. |
| `packages/theming/test/compile-oklch.test.ts` | Unit tests for the OKLCH helpers (emit-contract serialization, gamut clamp, contrast). |
| `packages/theming/src/compile/closure.ts` | `seedsInDraft(draft)` + `affectedClosure(seeds, graph)` + `topoOrder(roles, graph)` + `derivationDeps(d)`: transitive-closure-over-derivation-edges affected set (from the draft's seed set) + topological re-derivation order. Not exported from barrel. |
| `packages/theming/test/compile-closure.test.ts` | Unit tests for the closure (e.g. `primary` ⇒ `ring`) and topo order. |
| `packages/theming/src/compile/derive.ts` | `deriveRole(role, ctx)`: resolve one role's OKLCH value from its `Derivation` against the active `ModeProfile` (seed nudges, surface/line ladders, foreground search, offset). Not exported from barrel. |
| `packages/theming/test/compile-derive.test.ts` | Unit tests per derivation kind on one mode. |
| `packages/theming/src/compile/repair.ts` | `repairContrast(values, ctx)` → `RepairResult` (graph/tier/profile ride on the `DeriveCtx`): contrast-repair pass (fg moves / bg held; minimum-legible vs maximize-contrast; ring multi-pair; root-pair hard-reject flag). Not exported from barrel. |
| `packages/theming/test/compile-repair.test.ts` | Unit tests for the repair laws + root-pair hard-reject. |
| `packages/theming/src/compile/index.ts` | `CandidateTheme`/`CandidateMeta` types + `compile(draft, manifest)`: the four jobs in order (expand → repair → dark → map+serialize), locked-role pinning, base-as-canvas fallback. |
| `packages/theming/test/compile.test.ts` | End-to-end `compile` tests + golden files on `SHADCN_CAN`. |
| `packages/theming/test/__golden__/` | Golden serialized-output fixtures for canned StyleSpecs on the shadcn can. |
| `packages/theming/src/index.ts` | Barrel — add `export * from "./profile/index.js"` and `export * from "./compile/index.js"`. |

---

### Task 1: Ramp profile — types, `iv-profile-1` numbers, and lookup

**Files:**
- Create: `packages/theming/src/profile/index.ts`
- Test: `packages/theming/test/profile.test.ts`

**Interfaces:**
- Consumes (from Plan 01 `@invariance/theming/roles`, ledger §1/§2): `type StepId = string`, `type SeedId = string`.
- Produces (ledger §5.1):
  - `export const PROFILE_VERSION = "iv-profile-1" as const`
  - `export type ModeProfile = { anchorL: number; surfaceSteps: Record<StepId, number>; lineSteps: Record<StepId, number>; seedNudge?: Partial<Record<SeedId, { l?: number; c?: number; h?: number }>>; foregroundStep: number }`
  - `export type RampProfile = { profileVersion: string; light: ModeProfile; dark: ModeProfile; radiusOffsets: Record<StepId, number> }`
  - `export const ivProfile1: RampProfile`
  - `export function getRampProfile(profileVersion: string): RampProfile` (throws on unknown — retention §9)

- [ ] **Step 1: Write the failing test** — FULL vitest code in `packages/theming/test/profile.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PROFILE_VERSION,
  ivProfile1,
  getRampProfile,
  type RampProfile,
} from "../src/profile/index.js";

// The StepIds the iv-roles-1 instance uses (surface-step roles: card/popover/muted/secondary;
// line-step roles: border/input; offset roles: radius-sm/md/lg/xl). The profile must cover all.
const SURFACE_STEPS = ["card", "popover", "muted", "secondary"] as const;
const LINE_STEPS = ["border", "input"] as const;
const RADIUS_STEPS = ["sm", "md", "lg", "xl"] as const;

describe("iv-profile-1 ramp profile", () => {
  it("pins the version constant", () => {
    expect(PROFILE_VERSION).toBe("iv-profile-1");
    expect(ivProfile1.profileVersion).toBe("iv-profile-1");
  });

  it("has a light and a dark ModeProfile", () => {
    expect(ivProfile1.light).toBeDefined();
    expect(ivProfile1.dark).toBeDefined();
  });

  it("anchor-L polarizes: light surface is bright, dark surface is dark (the no-inverted-light law)", () => {
    expect(ivProfile1.light.anchorL).toBeGreaterThan(0.9);
    expect(ivProfile1.dark.anchorL).toBeLessThan(0.25);
  });

  it("covers every surface-step and line-step StepId in both modes", () => {
    for (const mode of [ivProfile1.light, ivProfile1.dark]) {
      for (const s of SURFACE_STEPS) expect(typeof mode.surfaceSteps[s]).toBe("number");
      for (const s of LINE_STEPS) expect(typeof mode.lineSteps[s]).toBe("number");
    }
  });

  it("surface steps move L toward the readable direction per mode", () => {
    // DARK is the load-bearing case: EVERY dark surface must lift ABOVE the near-black anchor
    // (positive delta) so cards/popovers/muted are visible — the invisible-dark-card bug is fixed by
    // a per-mode ladder, not a single signed delta. (A zero dark-card delta would make it vanish.)
    for (const s of SURFACE_STEPS) {
      expect(ivProfile1.dark.surfaceSteps[s]!).toBeGreaterThan(0);
    }
    // LIGHT: card/popover legitimately sit FLUSH with the white canvas (real shadcn — pure white on
    // pure white), so their delta may be 0; the recessed surfaces (muted/secondary) MUST drop below
    // the canvas to read as a soft grey.
    for (const s of ["card", "popover"] as const) {
      expect(ivProfile1.light.surfaceSteps[s]!).toBe(0);
    }
    for (const s of ["muted", "secondary"] as const) {
      expect(ivProfile1.light.surfaceSteps[s]!).toBeLessThan(0);
    }
  });

  it("radius offsets are mode-stable (single Record) and cover every radius StepId", () => {
    for (const s of RADIUS_STEPS) expect(typeof ivProfile1.radiusOffsets[s]).toBe("number");
  });

  it("foregroundStep is a positive monotonic search increment in both modes", () => {
    expect(ivProfile1.light.foregroundStep).toBeGreaterThan(0);
    expect(ivProfile1.dark.foregroundStep).toBeGreaterThan(0);
  });

  it("getRampProfile returns the pinned instance by version", () => {
    const p: RampProfile = getRampProfile("iv-profile-1");
    expect(p).toBe(ivProfile1);
  });

  it("getRampProfile throws on an unknown version (retention invariant, never a silent miscompile)", () => {
    expect(() => getRampProfile("iv-profile-99")).toThrow(/unknown profile version/i);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test profile`
  Expected failure: `Failed to resolve import "../src/profile/index.js"` (the module does not exist yet).

- [ ] **Step 3: Minimal implementation** — FULL code in `packages/theming/src/profile/index.ts`:

```ts
import type { StepId, SeedId } from "../roles/index.js";

/**
 * Pins the ramp profile (matches AppManifest.profileVersion). The NUMBERS leg of the three-way cut
 * (graph=relationships, profile=numbers, manifest=policy). All values here are eyes-on / golden-filed
 * (spec §12); the SHAPE is fixed, the magnitudes iterate against the shadcn reference gallery.
 */
export const PROFILE_VERSION = "iv-profile-1" as const;

/** Per-mode numbers. spec §3.1 law 1: color derivations are mode-polarized, so this is mode-indexed. */
export type ModeProfile = {
  /** surface-anchor base L for this mode (the --background lightness). */
  anchorL: number;
  /** signed L deltas (from anchorL) for surface-step roles, keyed by StepId. */
  surfaceSteps: Record<StepId, number>;
  /** signed L deltas (from anchorL) for line-step roles, keyed by StepId. */
  lineSteps: Record<StepId, number>;
  /** per-mode seed adjustment — e.g. dark lifts/desaturates primaries. Optional per seed. */
  seedNudge?: Partial<Record<SeedId, { l?: number; c?: number; h?: number }>>;
  /** monotonic L step size for the foreground search (spec §3.1 law 3). */
  foregroundStep: number;
};

export type RampProfile = {
  profileVersion: string;
  light: ModeProfile;
  dark: ModeProfile;
  /** offset(radius) deltas (px) — mode-stable (spec §3.1 law 1: dimension is mode-stable). */
  radiusOffsets: Record<StepId, number>;
};

export const ivProfile1: RampProfile = {
  profileVersion: PROFILE_VERSION,
  light: {
    // shadcn light: --background is near-white.
    anchorL: 1.0,
    // cards/popovers ride at white, muted/secondary drop into a soft grey beneath the canvas.
    surfaceSteps: {
      card: 0,
      popover: 0,
      muted: -0.04,
      secondary: -0.04,
    },
    // borders/inputs are quiet hairlines a touch below the canvas.
    lineSteps: {
      border: -0.1,
      input: -0.1,
    },
    // light brand seeds need no lift.
    seedNudge: {},
    foregroundStep: 0.02,
  },
  dark: {
    // shadcn dark: --background is near-black but NOT pure black (≈ oklch 0.145).
    anchorL: 0.145,
    // cards/popovers lift ABOVE the dark anchor so they are visible (per-mode ladder, not inverted
    // light). A subtle +0.03 keeps the card distinguishable from the near-black canvas (this is the
    // fix for the invisible-dark-card bug — a zero delta would make the card vanish into background).
    surfaceSteps: {
      card: 0.03,
      popover: 0.03,
      muted: 0.125,
      secondary: 0.125,
    },
    // dark borders/inputs lift modestly off the canvas.
    lineSteps: {
      border: 0.125,
      input: 0.125,
    },
    // dark mode lifts + desaturates brand primaries slightly so they read on a dark canvas.
    seedNudge: {
      primary: { l: 0.05, c: -0.01 },
      accent: { l: 0.05, c: -0.01 },
      destructive: { l: 0.05, c: -0.01 },
    },
    foregroundStep: 0.02,
  },
  radiusOffsets: {
    sm: -4,
    md: -2,
    lg: 0,
    xl: 4,
  },
};

const PROFILES: Record<string, RampProfile> = {
  [PROFILE_VERSION]: ivProfile1,
};

/** Lookup by version; throws on unknown (retention §9 — never a silent miscompile against the wrong numbers). */
export function getRampProfile(profileVersion: string): RampProfile {
  const p = PROFILES[profileVersion];
  if (!p) throw new Error(`unknown profile version: ${profileVersion}`);
  return p;
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test profile`
  Expected: PASS (9 passing in `profile.test.ts`).

- [ ] **Step 5: Commit** — `git add packages/theming/src/profile/index.ts packages/theming/test/profile.test.ts && git commit -m "feat(theming): iv-profile-1 ramp profile — mode-indexed L ladders + radius offsets (Plan 02 §5.1)"`

---

### Task 2: OKLCH helpers — `toOklch`, `contrast`, `stepFgL`, `emitValue`

**Files:**
- Create: `packages/theming/src/compile/oklch.ts`
- Test: `packages/theming/test/compile-oklch.test.ts`

**Interfaces:**
- Consumes (from Plan 01 `@invariance/theming/spec`, ledger §3.2): `type Oklch = { l: number; c: number; h: number }`.
- Consumes (from Plan 01 `@invariance/theming/manifest`, ledger §4.1): `type EmitContract = { shape: Shape; space: Space; precision: number }` where `Shape = "triple" | "function" | "raw" | "number"` and `Space = "hsl" | "rgb" | "oklch" | null`.
- Consumes (culori v4): `converter`, `clampChroma`, `formatHsl`, `formatRgb`, `wcagContrast`, `parse`.
- Produces (internal to `compile/`, NOT barrel-exported):
  - `export function toOklch(cssValue: string): Oklch` — parse any CSS color string to a clamped-chroma OKLCH object; throws on unparseable.
  - `export function contrast(a: Oklch, b: Oklch): number` — WCAG 2.0 ratio between two OKLCH colors.
  - `export function stepFgL(fg: Oklch, towardL: number, step: number): Oklch` — return `fg` with its L moved one `step` toward `towardL` (clamped to `[0,1]`).
  - `export function emitValue(color: Oklch, emit: EmitContract, chromaCap: number): string` — gamut-map on convert + serialize per the emit contract at fixed precision.

- [ ] **Step 1: Write the failing test** — FULL vitest code in `packages/theming/test/compile-oklch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toOklch, contrast, stepFgL, emitValue } from "../src/compile/oklch.js";
import type { Oklch } from "../src/spec/index.js";
import type { EmitContract } from "../src/manifest/index.js";

const WHITE: Oklch = toOklch("#ffffff");
const BLACK: Oklch = toOklch("#000000");

describe("toOklch", () => {
  it("parses a hex string to an OKLCH object", () => {
    const o = toOklch("#ffffff");
    expect(o.l).toBeCloseTo(1, 2);
    expect(o.c).toBeCloseTo(0, 2);
  });

  it("parses an oklch() string", () => {
    const o = toOklch("oklch(0.5 0.1 250)");
    expect(o.l).toBeCloseTo(0.5, 3);
    expect(o.c).toBeCloseTo(0.1, 3);
    expect(o.h).toBeCloseTo(250, 1);
  });

  it("throws on an unparseable string (the dangerous value never advances)", () => {
    expect(() => toOklch("javascript:alert(1)")).toThrow(/unparseable color/i);
  });
});

describe("contrast", () => {
  it("white-on-black is the maximal 21:1", () => {
    expect(contrast(WHITE, BLACK)).toBeCloseTo(21, 0);
  });

  it("is symmetric", () => {
    expect(contrast(WHITE, BLACK)).toBeCloseTo(contrast(BLACK, WHITE), 5);
  });
});

describe("stepFgL", () => {
  it("moves L toward the target by one step", () => {
    const fg: Oklch = { l: 0.5, c: 0.05, h: 100 };
    const next = stepFgL(fg, 1.0, 0.1);
    expect(next.l).toBeCloseTo(0.6, 5);
    expect(next.c).toBe(0.05);
    expect(next.h).toBe(100);
  });

  it("moves L toward a darker target (negative direction)", () => {
    const fg: Oklch = { l: 0.5, c: 0.05, h: 100 };
    const next = stepFgL(fg, 0.0, 0.1);
    expect(next.l).toBeCloseTo(0.4, 5);
  });

  it("clamps L to [0,1]", () => {
    const fg: Oklch = { l: 0.95, c: 0, h: 0 };
    expect(stepFgL(fg, 1.0, 0.1).l).toBe(1);
    const fg2: Oklch = { l: 0.05, c: 0, h: 0 };
    expect(stepFgL(fg2, 0.0, 0.1).l).toBe(0);
  });
});

describe("emitValue", () => {
  const hslTriple: EmitContract = { shape: "triple", space: "hsl", precision: 2 };
  const oklchFn: EmitContract = { shape: "function", space: "oklch", precision: 4 };
  const rawNumber: EmitContract = { shape: "number", space: null, precision: 3 };

  it("serializes hsl-triple (no hsl() wrapper, space-separated h s% l%) at fixed precision", () => {
    // white → hsl 0 0% 100%
    const out = emitValue(WHITE, hslTriple, 0.4);
    expect(out).toBe("0 0% 100%");
  });

  it("serializes a function shape with the space wrapper", () => {
    const out = emitValue({ l: 0.5, c: 0.1, h: 250 }, oklchFn, 0.4);
    expect(out.startsWith("oklch(")).toBe(true);
    expect(out.endsWith(")")).toBe(true);
  });

  it("serializes a number shape (radius px) at fixed precision with no space", () => {
    // a "number" emit carries the dimension in the .l field as the px value (compiler convention).
    const out = emitValue({ l: 8, c: 0, h: 0 }, rawNumber, 0.4);
    expect(out).toBe("8");
  });

  it("gamut-maps on convert: an out-of-sRGB OKLCH still serializes to a valid in-gamut hsl-triple", () => {
    // very saturated green beyond sRGB; clampChroma must pull it back so hsl() is meaningful.
    const wild: Oklch = { l: 0.85, c: 0.4, h: 145 };
    const out = emitValue(wild, hslTriple, 0.4);
    // hsl-triple is "<h> <s>% <l>%" — three space-separated tokens, s & l percentages in [0,100].
    const parts = out.split(" ");
    expect(parts).toHaveLength(3);
    const s = parseFloat(parts[1]!.replace("%", ""));
    const l = parseFloat(parts[2]!.replace("%", ""));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
    expect(l).toBeGreaterThanOrEqual(0);
    expect(l).toBeLessThanOrEqual(100);
  });

  it("clamps chroma to the cap before serializing", () => {
    const wild: Oklch = { l: 0.6, c: 0.5, h: 30 };
    const out = emitValue(wild, oklchFn, 0.1);
    // the second token of oklch(L C H) is the chroma; must be ≤ cap.
    const inner = out.slice("oklch(".length, -1);
    const c = parseFloat(inner.split(" ")[1]!);
    expect(c).toBeLessThanOrEqual(0.1 + 1e-6);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test compile-oklch`
  Expected failure: `Failed to resolve import "../src/compile/oklch.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code in `packages/theming/src/compile/oklch.ts`:

```ts
import {
  converter,
  clampChroma,
  inGamut,
  formatHsl,
  formatRgb,
  wcagContrast,
  parse,
  type Oklch as CuloriOklch,
} from "culori";
import type { Oklch } from "../spec/index.js";
import type { EmitContract } from "../manifest/index.js";

const toCuloriOklch = converter("oklch");
const toHsl = converter("hsl");
const toRgb = converter("rgb");
const inSrgb = inGamut("rgb");

/**
 * Below this OKLCH chroma a color is treated as achromatic: its hue is undefined, so converting to
 * hsl/rgb yields a garbage hue + a floating-point ghost saturation (e.g. white → "300 0.5% 100%").
 * Pinning s=0/h=0 in that regime makes white serialize to the byte-stable "0 0% 100%" the emit
 * contract and golden files require.
 */
const ACHROMATIC_EPS = 1e-4;

/** Parse any CSS color string to a clamped-chroma OKLCH object. Throws on unparseable. */
export function toOklch(cssValue: string): Oklch {
  const parsed = parse(cssValue);
  if (!parsed) throw new Error(`unparseable color: ${cssValue}`);
  const o = toCuloriOklch(parsed);
  return { l: o.l ?? 0, c: o.c ?? 0, h: o.h ?? 0 };
}

function asCulori(o: Oklch): CuloriOklch {
  return { mode: "oklch", l: o.l, c: o.c, h: o.h };
}

/** WCAG 2.0 contrast ratio between two OKLCH colors. */
export function contrast(a: Oklch, b: Oklch): number {
  return wcagContrast(asCulori(a), asCulori(b));
}

/** Move fg's L one step toward `towardL`, holding C/H, clamped to [0,1]. */
export function stepFgL(fg: Oklch, towardL: number, step: number): Oklch {
  const dir = towardL >= fg.l ? 1 : -1;
  const l = Math.min(1, Math.max(0, fg.l + dir * step));
  return { l, c: fg.c, h: fg.h };
}

function round(n: number, precision: number): number {
  const f = 10 ** precision;
  return Math.round(n * f) / f;
}

function fmt(n: number, precision: number): string {
  // fixed precision, then strip trailing zeros so "8.000" → "8" and "0.50" → "0.5".
  return String(round(n, precision));
}

/** Gamut-map ON CONVERT, but only when needed: an already-in-sRGB color is returned untouched so
 * clampChroma never perturbs an in-gamut value (byte-stability for golden files). */
function gamutMapSrgb(capped: CuloriOklch): CuloriOklch {
  return inSrgb(capped) ? capped : (clampChroma(capped, "rgb") as CuloriOklch);
}

/**
 * Map an OKLCH color (or a number carried in `.l` for dimension roles) to a serialized string
 * per the emit contract, with gamut-map ON CONVERT (clampChroma) for color spaces. Near-achromatic
 * colors pin s/h to 0 so white serializes byte-stably (no floating-point ghost hue/saturation).
 */
export function emitValue(color: Oklch, emit: EmitContract, chromaCap: number): string {
  // Dimension/number roles: the px value rides in `.l`; no color space.
  if (emit.shape === "number" || emit.space === null) {
    return fmt(color.l, emit.precision);
  }

  // Clamp chroma to the cap first (the chroma cap is its own invariant, applied pre-gamut-map).
  const cappedChroma = Math.min(color.c, chromaCap);
  const achromatic = cappedChroma <= ACHROMATIC_EPS;
  const capped: CuloriOklch = { mode: "oklch", l: color.l, c: cappedChroma, h: color.h };

  switch (emit.space) {
    case "oklch": {
      // oklch reads l/c/h directly — no hue/sat round-trip, so no ghost-hue handling needed; just
      // gamut-map chroma into sRGB so the emitted value is renderable.
      const g = clampChroma(capped, "oklch") as CuloriOklch;
      const l = fmt(g.l ?? 0, emit.precision);
      const c = fmt(g.c ?? 0, emit.precision);
      const h = fmt(achromatic ? 0 : g.h ?? 0, emit.precision);
      if (emit.shape === "function") return `oklch(${l} ${c} ${h})`;
      return `${l} ${c} ${h}`; // triple
    }
    case "hsl": {
      // hsl rides sRGB: gamut-map (only if out of gamut), read back as hsl, pin s/h when achromatic.
      const g = gamutMapSrgb(capped);
      const hsl = toHsl(g);
      const h = fmt(achromatic ? 0 : hsl.h ?? 0, emit.precision);
      const s = fmt(achromatic ? 0 : (hsl.s ?? 0) * 100, emit.precision);
      const l = fmt((hsl.l ?? 0) * 100, emit.precision);
      if (emit.shape === "function") return formatHsl(g);
      return `${h} ${s}% ${l}%`; // triple
    }
    case "rgb": {
      const g = gamutMapSrgb(capped);
      const rgb = toRgb(g);
      const r = Math.round((rgb.r ?? 0) * 255);
      const gg = Math.round((rgb.g ?? 0) * 255);
      const b = Math.round((rgb.b ?? 0) * 255);
      if (emit.shape === "function") return formatRgb(g);
      return `${r} ${gg} ${b}`; // triple
    }
    default:
      // exhaustiveness guard: Space ∈ {hsl, rgb, oklch, null}; null handled above.
      throw new Error(`unhandled emit space: ${String(emit.space)}`);
  }
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test compile-oklch`
  Expected: PASS (all `compile-oklch.test.ts` cases green).

- [ ] **Step 5: Commit** — `git add packages/theming/src/compile/oklch.ts packages/theming/test/compile-oklch.test.ts && git commit -m "feat(theming): compile OKLCH helpers — emitValue (gamut-map-on-convert per emit contract), contrast, stepFgL (Plan 02 §4.5)"`

---

### Task 3: Affected closure + topological order

**Files:**
- Create: `packages/theming/src/compile/closure.ts`
- Test: `packages/theming/test/compile-closure.test.ts`

**Interfaces:**
- Consumes (from Plan 01 `@invariance/theming/roles`, ledger §2): `type RoleGraph`, `type Derivation`, `type RoleId`, `type SeedId`, `ivRoles1`.
- Consumes (from Plan 01 `@invariance/theming/spec`, ledger §3.4): `type StyleSpec`.
- Produces (internal to `compile/`, NOT barrel-exported):
  - `export function seedsInDraft(draft: StyleSpec): Set<SeedId>` — the set of seeds the draft sets.
  - `export function affectedClosure(seeds: Set<SeedId>, graph: RoleGraph): Set<RoleId>` — every role whose derivation TRANSITIVELY depends on a set seed (closure over derivation edges, not one-hop).
  - `export function topoOrder(roles: Set<RoleId>, graph: RoleGraph): RoleId[]` — topological re-derivation order (a role after its derivation dependencies).
  - `export function derivationDeps(d: Derivation): { seeds: SeedId[]; roles: RoleId[] }` — the seeds + roles a single derivation reads.

- [ ] **Step 1: Write the failing test** — FULL vitest code in `packages/theming/test/compile-closure.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ivRoles1 } from "../src/roles/index.js";
import {
  seedsInDraft,
  affectedClosure,
  topoOrder,
  derivationDeps,
} from "../src/compile/closure.js";
import type { StyleSpec } from "../src/spec/index.js";

describe("seedsInDraft", () => {
  it("collects color seeds present in the draft (neutral is a seed even with no var)", () => {
    const draft: StyleSpec = { colors: { primary: { l: 0.5, c: 0.1, h: 250 }, neutral: { l: 0.5, c: 0, h: 0 } } };
    const s = seedsInDraft(draft);
    expect(s.has("primary")).toBe(true);
    expect(s.has("neutral")).toBe(true);
    expect(s.has("accent")).toBe(false);
  });

  it("collects radius + density + typography axes when present", () => {
    const draft: StyleSpec = { radius: 8, density: "compact", typography: { body: "inter" } };
    const s = seedsInDraft(draft);
    expect(s.has("radius")).toBe(true);
    expect(s.has("density")).toBe(true);
    expect(s.has("body")).toBe(true);
  });

  it("an empty draft has no seeds", () => {
    expect(seedsInDraft({}).size).toBe(0);
  });
});

describe("derivationDeps", () => {
  it("reads seeds for seed/surface/line/accent-line/offset and roles for foreground-of", () => {
    expect(derivationDeps({ kind: "seed", seed: "primary" })).toEqual({ seeds: ["primary"], roles: [] });
    expect(derivationDeps({ kind: "surface-step", seed: "neutral", step: "card" })).toEqual({ seeds: ["neutral"], roles: [] });
    expect(derivationDeps({ kind: "accent-line", seed: "primary" })).toEqual({ seeds: ["primary"], roles: [] });
    expect(derivationDeps({ kind: "offset", seed: "radius", step: "sm" })).toEqual({ seeds: ["radius"], roles: [] });
    expect(derivationDeps({ kind: "foreground-of", bg: "card", strategy: "maximize-contrast" })).toEqual({ seeds: [], roles: ["card"] });
    expect(derivationDeps({ kind: "pick", axis: "body" })).toEqual({ seeds: ["body"], roles: [] });
  });
});

describe("affectedClosure", () => {
  it("setting primary re-derives ring (transitive, NOT one-hop seed membership)", () => {
    const closure = affectedClosure(new Set(["primary"]), ivRoles1);
    expect(closure.has("primary")).toBe(true);
    expect(closure.has("ring")).toBe(true);   // ring = accent-line(primary)
    expect(closure.has("primary-fg")).toBe(true); // foreground-of(primary)
    expect(closure.has("background")).toBe(false); // surface-anchor(neutral) — untouched
  });

  it("setting neutral re-derives the whole surface/line/foreground closure", () => {
    const closure = affectedClosure(new Set(["neutral"]), ivRoles1);
    for (const r of ["background", "card", "popover", "muted", "secondary", "border", "input", "foreground", "card-fg", "popover-fg", "muted-fg"]) {
      expect(closure.has(r)).toBe(true);
    }
    // ring is checked against background (a ui pair) but ITS derivation is accent-line(primary),
    // so a neutral-only change does not re-derive ring's value.
    expect(closure.has("ring")).toBe(false);
  });

  it("an empty seed set yields an empty closure (base-as-canvas)", () => {
    expect(affectedClosure(new Set(), ivRoles1).size).toBe(0);
  });
});

describe("topoOrder", () => {
  it("orders a foreground after its bg dependency", () => {
    const roles = new Set(["card", "card-fg"]);
    const order = topoOrder(roles, ivRoles1);
    expect(order.indexOf("card")).toBeLessThan(order.indexOf("card-fg"));
  });

  it("returns every input role exactly once", () => {
    const roles = new Set(["background", "card", "card-fg", "foreground"]);
    const order = topoOrder(roles, ivRoles1);
    expect([...order].sort()).toEqual([...roles].sort());
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test compile-closure`
  Expected failure: `Failed to resolve import "../src/compile/closure.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code in `packages/theming/src/compile/closure.ts`:

```ts
import type { RoleGraph, Derivation, RoleId, SeedId } from "../roles/index.js";
import type { StyleSpec } from "../spec/index.js";

/** The seeds a single derivation reads, and the roles it reads (foreground-of only). */
export function derivationDeps(d: Derivation): { seeds: SeedId[]; roles: RoleId[] } {
  switch (d.kind) {
    case "seed":
      return { seeds: [d.seed], roles: [] };
    case "surface-anchor":
      return { seeds: [d.seed], roles: [] };
    case "surface-step":
      return { seeds: [d.seed], roles: [] };
    case "line-step":
      return { seeds: [d.seed], roles: [] };
    case "accent-line":
      return { seeds: [d.seed], roles: [] };
    case "offset":
      return { seeds: [d.seed], roles: [] };
    case "pick":
      return { seeds: [d.axis], roles: [] };
    case "foreground-of":
      return { seeds: [], roles: [d.bg] };
  }
}

/** The set of seeds the draft sets (color seeds + radius/density/typography axes). */
export function seedsInDraft(draft: StyleSpec): Set<SeedId> {
  const s = new Set<SeedId>();
  if (draft.colors) {
    for (const seed of ["primary", "accent", "neutral", "destructive"] as const) {
      if (draft.colors[seed] !== undefined) s.add(seed);
    }
  }
  if (draft.radius !== undefined) s.add("radius");
  if (draft.density !== undefined) s.add("density");
  if (draft.typography) {
    for (const axis of ["display", "body", "mono"] as const) {
      if (draft.typography[axis] !== undefined) s.add(axis);
    }
  }
  return s;
}

/**
 * Every role whose derivation TRANSITIVELY depends on one of `seeds`. The dependency test is the
 * transitive closure over derivation edges (a role depends on the seeds/roles its derivation reads),
 * NOT one-hop seed membership — so setting `primary` pulls in `ring` (accent-line(primary)) and
 * `primary-fg` (foreground-of(primary)).
 */
export function affectedClosure(seeds: Set<SeedId>, graph: RoleGraph): Set<RoleId> {
  const affected = new Set<RoleId>();
  // Iterate to a fixed point: a foreground-of role becomes affected once its bg role is affected.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [role, def] of Object.entries(graph.roles)) {
      if (affected.has(role)) continue;
      const deps = derivationDeps(def.derivation);
      const seedHit = deps.seeds.some((s) => seeds.has(s));
      const roleHit = deps.roles.some((r) => affected.has(r));
      if (seedHit || roleHit) {
        affected.add(role);
        changed = true;
      }
    }
  }
  return affected;
}

/** Topological order over the affected role set: a role appears after every role its derivation reads. */
export function topoOrder(roles: Set<RoleId>, graph: RoleGraph): RoleId[] {
  const order: RoleId[] = [];
  const placed = new Set<RoleId>();
  const visiting = new Set<RoleId>();

  const visit = (role: RoleId): void => {
    if (placed.has(role)) return;
    if (visiting.has(role)) throw new Error(`derivation cycle at role: ${role}`);
    visiting.add(role);
    const def = graph.roles[role];
    if (def) {
      for (const dep of derivationDeps(def.derivation).roles) {
        if (roles.has(dep)) visit(dep);
      }
    }
    visiting.delete(role);
    placed.add(role);
    order.push(role);
  };

  for (const role of roles) visit(role);
  return order;
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test compile-closure`
  Expected: PASS (all `compile-closure.test.ts` cases green).

- [ ] **Step 5: Commit** — `git add packages/theming/src/compile/closure.ts packages/theming/test/compile-closure.test.ts && git commit -m "feat(theming): compile closure — transitive affected-set over derivation edges + topo order (Plan 02 §4.5 job 1)"`

---

### Task 4: Per-role derivation against a ModeProfile

**Files:**
- Create: `packages/theming/src/compile/derive.ts`
- Test: `packages/theming/test/compile-derive.test.ts`

**Interfaces:**
- Consumes (Plan 01): `type RoleGraph`, `type Derivation`, `type RoleId`, `type SeedId`, `requiredContrast`, `ivRoles1` (`@invariance/theming/roles`); `type Oklch`, `type StyleSpec` (`@invariance/theming/spec`); `type ModeProfile`, `type RampProfile` (this plan, Task 1 — `RampProfile["radiusOffsets"]` is threaded through `DeriveCtx`).
- Consumes (Task 2 OKLCH helpers): `contrast`, `stepFgL` (the implementation); the test additionally uses `toOklch` to build seed fixtures.
- Produces (internal to `compile/`, NOT barrel-exported):
  - `export type DeriveCtx = { mode: "light" | "dark"; profile: ModeProfile; graph: RoleGraph; tier: "AA" | "AAA"; seeds: Record<SeedId, Oklch>; resolved: Record<RoleId, Oklch> }`
  - `export function seedValue(seed: SeedId, ctx: DeriveCtx): Oklch` — a seed's OKLCH with the per-mode `seedNudge` applied.
  - `export function deriveRole(role: RoleId, ctx: DeriveCtx): Oklch` — resolve one role's value from its `Derivation` against `ctx` (assumes its role-deps already in `ctx.resolved`).

- [ ] **Step 1: Write the failing test** — FULL vitest code in `packages/theming/test/compile-derive.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ivRoles1, requiredContrast } from "../src/roles/index.js";
import { ivProfile1 } from "../src/profile/index.js";
import { deriveRole, seedValue, type DeriveCtx } from "../src/compile/derive.js";
import { toOklch, contrast } from "../src/compile/oklch.js";
import type { Oklch } from "../src/spec/index.js";
import type { SeedId, RoleId } from "../src/roles/index.js";

function ctx(mode: "light" | "dark", seedOverrides: Partial<Record<SeedId, Oklch>> = {}): DeriveCtx {
  const seeds: Record<SeedId, Oklch> = {
    primary: toOklch("oklch(0.55 0.18 250)"),
    accent: toOklch("oklch(0.6 0.12 200)"),
    neutral: toOklch("oklch(0.5 0 0)"),
    destructive: toOklch("oklch(0.55 0.2 25)"),
    radius: { l: 8, c: 0, h: 0 }, // radius px rides in .l
    ...seedOverrides,
  };
  return {
    mode,
    profile: mode === "light" ? ivProfile1.light : ivProfile1.dark,
    graph: ivRoles1,
    tier: "AA",
    seeds,
    resolved: {} as Record<RoleId, Oklch>,
    radiusOffsets: ivProfile1.radiusOffsets, // mode-stable offsets — the offset() derivation reads these
  };
}

describe("seedValue", () => {
  it("returns the raw seed in light (no nudge configured)", () => {
    const c = ctx("light");
    expect(seedValue("primary", c).l).toBeCloseTo(0.55, 5);
  });

  it("applies the per-mode dark seed nudge (lift L, drop C)", () => {
    const c = ctx("dark");
    const v = seedValue("primary", c);
    expect(v.l).toBeCloseTo(0.55 + 0.05, 5);
    expect(v.c).toBeCloseTo(0.18 - 0.01, 5);
  });
});

describe("deriveRole — seed", () => {
  it("primary derives to the (nudged) seed value", () => {
    const c = ctx("light");
    expect(deriveRole("primary", c).l).toBeCloseTo(0.55, 5);
  });
});

describe("deriveRole — surface-anchor / surface-step / line-step", () => {
  it("background uses the mode anchor-L (light bright, dark dark)", () => {
    expect(deriveRole("background", ctx("light")).l).toBeCloseTo(ivProfile1.light.anchorL, 5);
    expect(deriveRole("background", ctx("dark")).l).toBeCloseTo(ivProfile1.dark.anchorL, 5);
  });

  it("dark card lifts ABOVE the dark anchor (the no-invisible-card law)", () => {
    const c = ctx("dark");
    const card = deriveRole("card", c);
    expect(card.l).toBeGreaterThan(ivProfile1.dark.anchorL);
    expect(card.l).toBeCloseTo(ivProfile1.dark.anchorL + ivProfile1.dark.surfaceSteps.card!, 5);
  });

  it("border uses the line-step ladder off the anchor", () => {
    const c = ctx("light");
    const border = deriveRole("border", c);
    expect(border.l).toBeCloseTo(ivProfile1.light.anchorL + ivProfile1.light.lineSteps.border!, 5);
  });
});

describe("deriveRole — foreground-of", () => {
  it("maximize-contrast on a bright background yields a dark legible foreground that clears AA text", () => {
    const c = ctx("light");
    c.resolved["background"] = deriveRole("background", c);
    const fg = deriveRole("foreground", c);
    expect(contrast(fg, c.resolved["background"]!)).toBeGreaterThanOrEqual(requiredContrast("AA", "text"));
  });

  it("minimum-legible (muted-fg) stops at the large-text floor, not the extreme", () => {
    const c = ctx("light");
    c.resolved["muted"] = deriveRole("muted", c);
    const mutedFg = deriveRole("muted-fg", c);
    const ratio = contrast(mutedFg, c.resolved["muted"]!);
    expect(ratio).toBeGreaterThanOrEqual(requiredContrast("AA", "large-text"));
    // minimum-legible is the "quiet" stop-at-floor rule: it lands well below the extreme. A
    // maximize-contrast foreground on the SAME muted bg runs to the extreme, so it has strictly more
    // contrast. (background must be resolved first so the maximize foreground can derive.)
    c.resolved["background"] = deriveRole("background", c);
    const maxFg = deriveRole("foreground", c); // foreground-of(background, maximize-contrast)
    expect(contrast(maxFg, c.resolved["muted"]!)).toBeGreaterThan(ratio);
  });
});

describe("deriveRole — accent-line / offset", () => {
  it("ring derives from primary (accent-line)", () => {
    const c = ctx("light");
    const ring = deriveRole("ring", c);
    // ring rides primary's hue.
    expect(ring.h).toBeCloseTo(seedValue("primary", c).h, 0);
  });

  it("radius-sm offsets the radius seed by the mode-stable radius offset (px in .l)", () => {
    const c = ctx("light");
    const sm = deriveRole("radius-sm", c);
    expect(sm.l).toBeCloseTo(8 + ivProfile1.radiusOffsets.sm!, 5);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test compile-derive`
  Expected failure: `Failed to resolve import "../src/compile/derive.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code in `packages/theming/src/compile/derive.ts`:

```ts
import type { RoleGraph, RoleId, SeedId } from "../roles/index.js";
import { requiredContrast } from "../roles/index.js";
import type { Oklch } from "../spec/index.js";
import type { ModeProfile, RampProfile } from "../profile/index.js";
import { contrast, stepFgL } from "./oklch.js";

export type DeriveCtx = {
  mode: "light" | "dark";
  profile: ModeProfile;
  graph: RoleGraph;
  tier: "AA" | "AAA";
  /** seed OKLCH values (radius px rides in .l). */
  seeds: Record<SeedId, Oklch>;
  /** already-resolved role values this derivation may read (foreground-of bg). */
  resolved: Record<RoleId, Oklch>;
  /** mode-stable radius offsets (passed through from the RampProfile). */
  radiusOffsets?: RampProfile["radiusOffsets"];
};

/** A seed's OKLCH with the per-mode seedNudge applied (lift/desaturate primaries in dark). */
export function seedValue(seed: SeedId, ctx: DeriveCtx): Oklch {
  const base = ctx.seeds[seed];
  if (!base) throw new Error(`missing seed value: ${seed}`);
  const nudge = ctx.profile.seedNudge?.[seed];
  if (!nudge) return base;
  return {
    l: base.l + (nudge.l ?? 0),
    c: Math.max(0, base.c + (nudge.c ?? 0)),
    h: base.h + (nudge.h ?? 0),
  };
}

/**
 * Resolve one role's OKLCH value from its Derivation against the active mode's ModeProfile.
 * Assumes any role-deps (foreground-of bg) are already in ctx.resolved.
 */
export function deriveRole(role: RoleId, ctx: DeriveCtx): Oklch {
  const def = ctx.graph.roles[role];
  if (!def) throw new Error(`unknown role: ${role}`);
  const d = def.derivation;
  const neutral = (): Oklch => seedValue("neutral", ctx);

  switch (d.kind) {
    case "seed":
      return seedValue(d.seed, ctx);

    case "surface-anchor": {
      const n = neutral();
      return { l: ctx.profile.anchorL, c: n.c, h: n.h };
    }

    case "surface-step": {
      const n = neutral();
      const delta = ctx.profile.surfaceSteps[d.step] ?? 0;
      return { l: clamp01(ctx.profile.anchorL + delta), c: n.c, h: n.h };
    }

    case "line-step": {
      const n = neutral();
      const delta = ctx.profile.lineSteps[d.step] ?? 0;
      return { l: clamp01(ctx.profile.anchorL + delta), c: n.c, h: n.h };
    }

    case "accent-line": {
      // ring rides the seed's hue/chroma at the seed's L (a colored focus line).
      return seedValue(d.seed, ctx);
    }

    case "offset": {
      const seed = seedValue(d.seed, ctx); // radius px in .l
      const delta = ctx.radiusOffsets?.[d.step] ?? 0;
      return { l: Math.max(0, seed.l + delta), c: 0, h: 0 };
    }

    case "pick":
      // typography picks are not OKLCH — handled outside the OKLCH path; return a sentinel.
      throw new Error(`pick derivation has no OKLCH value: ${role}`);

    case "foreground-of": {
      const bg = ctx.resolved[d.bg];
      if (!bg) throw new Error(`foreground-of(${d.bg}) before bg resolved`);
      return foregroundSearch(bg, ctx, d.strategy);
    }
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * The shared monotonic foreground search (spec §3.1 law 3): step L from bg.L toward the
 * contrast-increasing extreme (across mid-L from bg), holding H/C.
 *  - maximize-contrast: run to the extreme (0 or 1).
 *  - minimum-legible: stop at the first step that clears the role's floor.
 * Strategy here uses the *text* floor as the legibility target for minimum-legible's stop rule;
 * the compiler's repair pass (Task 5) is the final gate against the role's actual pair category.
 */
/** The achromatic extreme (L=0 black or L=1 white) that yields the HIGHER WCAG contrast against bg.
 * Determined by real contrast, NOT an OKLCH-L proxy: a saturated mid-L blue (oklch L≈0.55) has a low
 * sRGB luminance, so white-on-it beats black-on-it — an `bg.l >= 0.5 ? 0 : 1` heuristic picks the
 * WRONG (failing) direction. spec §3.1 law 3 says "the contrast-increasing extreme" — measure it. */
function contrastIncreasingExtreme(bg: Oklch): 0 | 1 {
  const toWhite = contrast({ l: 1, c: 0, h: bg.h }, bg);
  const toBlack = contrast({ l: 0, c: 0, h: bg.h }, bg);
  return toWhite >= toBlack ? 1 : 0;
}

function foregroundSearch(
  bg: Oklch,
  ctx: DeriveCtx,
  strategy: "maximize-contrast" | "minimum-legible",
): Oklch {
  const towardL = contrastIncreasingExtreme(bg); // the contrast-increasing extreme (measured, not L-proxy)
  const step = ctx.profile.foregroundStep;
  // foregrounds are near-achromatic text colors: ride a neutral hue, low chroma.
  let fg: Oklch = { l: bg.l, c: 0, h: bg.h };
  const floor =
    strategy === "minimum-legible"
      ? requiredContrast(ctx.tier, "large-text")
      : Infinity; // maximize: never satisfied early → runs to the target extreme
  for (let i = 0; i < 100; i++) {
    if (contrast(fg, bg) >= floor) return fg;
    // Stop ONLY at the TARGET extreme (towardL). fg starts at bg.l — which for a bg already at an
    // extreme (e.g. background L=1.0) is the *opposite* extreme — so a `fg.l === 0 || fg.l === 1`
    // test would bail on the first iteration and return white-on-white. Test reaching `towardL`.
    if (fg.l === towardL) return fg;
    fg = stepFgL(fg, towardL, step);
  }
  return fg;
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test compile-derive`
  Expected: PASS (all `compile-derive.test.ts` cases green).

- [ ] **Step 5: Commit** — `git add packages/theming/src/compile/derive.ts packages/theming/test/compile-derive.test.ts && git commit -m "feat(theming): compile derive — per-role OKLCH resolution against the mode profile + foreground search (Plan 02 §3.1/§4.5)"`

---

### Task 5: Contrast repair pass

**Files:**
- Create: `packages/theming/src/compile/repair.ts`
- Test: `packages/theming/test/compile-repair.test.ts`

**Interfaces:**
- Consumes (Plan 01): `type ContrastPair`, `type RoleId`, `requiredContrast` (impl), `type SeedId`, `ivRoles1` (test fixture) (`@invariance/theming/roles`); `type Oklch` (`@invariance/theming/spec`).
- Consumes (Task 2 helpers): `contrast`, `stepFgL` (impl); the test additionally uses `toOklch`.
- Consumes (Task 4): `type DeriveCtx` (for `tier`, `profile.foregroundStep`).
- Produces (internal to `compile/`, NOT barrel-exported):
  - `export type RepairResult = { values: Record<RoleId, Oklch>; rootPairFailed: boolean }`
  - `export function repairContrast(values: Record<RoleId, Oklch>, ctx: DeriveCtx): RepairResult` — adjust the `fg` member of each failing `contrastPair` (bg held, seeds never moved); ring repaired against its multi-pair set; root-pair `(foreground,background)` hard-reject flagged when foreground maxed still fails.

- [ ] **Step 1: Write the failing test** — FULL vitest code in `packages/theming/test/compile-repair.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ivRoles1, requiredContrast } from "../src/roles/index.js";
import { ivProfile1 } from "../src/profile/index.js";
import { repairContrast } from "../src/compile/repair.js";
import { toOklch, contrast } from "../src/compile/oklch.js";
import type { DeriveCtx } from "../src/compile/derive.js";
import type { Oklch } from "../src/spec/index.js";
import type { RoleId, SeedId } from "../src/roles/index.js";

function ctx(): DeriveCtx {
  const seeds: Record<SeedId, Oklch> = {
    primary: toOklch("oklch(0.55 0.18 250)"),
    accent: toOklch("oklch(0.6 0.12 200)"),
    neutral: toOklch("oklch(0.5 0 0)"),
    destructive: toOklch("oklch(0.55 0.2 25)"),
    radius: { l: 8, c: 0, h: 0 },
  };
  return { mode: "light", profile: ivProfile1.light, graph: ivRoles1, tier: "AA", seeds, resolved: {} as Record<RoleId, Oklch> };
}

describe("repairContrast", () => {
  it("raises a failing primary-fg until it clears the AA text floor against primary (held)", () => {
    const c = ctx();
    const primary = c.seeds.primary!;
    // start primary-fg too close to primary (a deliberately failing pair).
    const values: Record<RoleId, Oklch> = {
      primary: primary,
      "primary-fg": { l: primary.l + 0.02, c: 0, h: primary.h },
    };
    const before = contrast(values["primary-fg"]!, primary);
    expect(before).toBeLessThan(requiredContrast("AA", "text"));
    const { values: out, rootPairFailed } = repairContrast(values, c);
    expect(rootPairFailed).toBe(false);
    expect(contrast(out["primary-fg"]!, out.primary!)).toBeGreaterThanOrEqual(requiredContrast("AA", "text"));
    // primary (the bg / a seed) did not move.
    expect(out.primary).toEqual(primary);
  });

  it("never moves a seed — the bg member of a pair holds", () => {
    const c = ctx();
    const values: Record<RoleId, Oklch> = {
      background: { l: 1, c: 0, h: 0 },
      foreground: { l: 0.95, c: 0, h: 0 }, // failing, near-white on white
    };
    const { values: out } = repairContrast(values, c);
    expect(out.background).toEqual({ l: 1, c: 0, h: 0 }); // bg held
    expect(contrast(out.foreground!, out.background!)).toBeGreaterThanOrEqual(requiredContrast("AA", "text"));
  });

  it("ring is repaired against its multi-pair SET (clears the closest-in-L surface)", () => {
    const c = ctx();
    const values: Record<RoleId, Oklch> = {
      background: { l: 1, c: 0, h: 0 },
      card: { l: 1, c: 0, h: 0 },
      popover: { l: 1, c: 0, h: 0 },
      ring: { l: 0.97, c: 0.1, h: 250 }, // too light → fails ui 3:1 on white surfaces
    };
    const { values: out } = repairContrast(values, c);
    for (const bg of ["background", "card", "popover"] as const) {
      expect(contrast(out.ring!, out[bg]!)).toBeGreaterThanOrEqual(requiredContrast("AA", "ui"));
    }
  });

  it("root-pair hard-reject: a black background with foreground maxed at white that still fails flags rootPairFailed", () => {
    // Construct an impossible case by demanding AAA text on a mid-grey bg that cannot reach 7:1
    // even with foreground at an extreme. mid-grey 0.5 ⇒ max ratio to white or black is < 7.
    const c = ctx();
    c.tier = "AAA";
    const values: Record<RoleId, Oklch> = {
      background: { l: 0.5, c: 0, h: 0 },
      foreground: { l: 0.5, c: 0, h: 0 },
    };
    const { rootPairFailed } = repairContrast(values, c);
    expect(rootPairFailed).toBe(true);
  });

  it("a passing set is returned unchanged with rootPairFailed=false", () => {
    const c = ctx();
    const values: Record<RoleId, Oklch> = {
      background: { l: 1, c: 0, h: 0 },
      foreground: { l: 0, c: 0, h: 0 },
    };
    const { values: out, rootPairFailed } = repairContrast(values, c);
    expect(rootPairFailed).toBe(false);
    expect(out.foreground).toEqual({ l: 0, c: 0, h: 0 });
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test compile-repair`
  Expected failure: `Failed to resolve import "../src/compile/repair.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code in `packages/theming/src/compile/repair.ts`:

```ts
import type { ContrastPair, RoleId } from "../roles/index.js";
import { requiredContrast } from "../roles/index.js";
import type { Oklch } from "../spec/index.js";
import type { DeriveCtx } from "./derive.js";
import { contrast, stepFgL } from "./oklch.js";

export type RepairResult = {
  values: Record<RoleId, Oklch>;
  rootPairFailed: boolean;
};

/**
 * Contrast repair (spec §3.1 law 2/3): for each failing contrastPair, move the L of the `fg` member
 * toward the contrast-increasing extreme, holding the `bg` member. Seeds are never `fg` members, so
 * the brand color never moves. `ring` is the lone multi-pair repair: it must clear EVERY ui-pair bg
 * in its set, so we drive it against its worst (closest-in-contrast) surface. The root pair
 * (foreground, background) hard-rejects: if foreground at the extreme still fails, flag it.
 */
export function repairContrast(
  initial: Record<RoleId, Oklch>,
  ctx: DeriveCtx,
): RepairResult {
  const values: Record<RoleId, Oklch> = { ...initial };
  let rootPairFailed = false;
  const step = ctx.profile.foregroundStep;

  // Group pairs by fg so ring (3 pairs) is repaired against its whole set at once.
  const byFg = new Map<RoleId, ContrastPair[]>();
  for (const pair of ctx.graph.contrastPairs) {
    const list = byFg.get(pair.fg) ?? [];
    list.push(pair);
    byFg.set(pair.fg, list);
  }

  for (const [fgRole, pairs] of byFg) {
    let fg = values[fgRole];
    if (!fg) continue; // role not present in this candidate (not in the affected set)
    const bgs = pairs
      .map((p) => ({ bg: values[p.bg], floor: requiredContrast(ctx.tier, p.category) }))
      .filter((x): x is { bg: Oklch; floor: number } => x.bg !== undefined);
    if (bgs.length === 0) continue;

    const allClear = (cand: Oklch): boolean =>
      bgs.every(({ bg, floor }) => contrast(cand, bg) >= floor);

    // direction: the achromatic extreme (L=0 / L=1) that maximizes the WORST-case contrast across
    // the whole bg set (ring is a multi-pair set). Measured by real contrast, NOT an OKLCH-L proxy —
    // a saturated mid-L bg can be perceptually dark, so the contrast-increasing extreme is white even
    // when bg.l ≥ 0.5. This is what lets primary-fg repair toward white against a saturated primary.
    const worstAt = (L: 0 | 1): number =>
      Math.min(...bgs.map(({ bg }) => contrast({ l: L, c: 0, h: fg!.h }, bg)));
    const towardL: 0 | 1 = worstAt(1) >= worstAt(0) ? 1 : 0;

    for (let i = 0; i < 100 && !allClear(fg); i++) {
      // Stop at the TARGET extreme (towardL), not "either extreme": an fg starting at the opposite
      // extreme (e.g. a base white foreground that must darken) must still be allowed to traverse,
      // and the root-pair hard-reject below must only fire when fg is maxed at the RIGHT end.
      if (fg.l === towardL) break;
      fg = stepFgL(fg, towardL, step);
    }
    values[fgRole] = fg;

    // root-pair hard reject: (foreground, background) maxed still failing.
    const isRoot = pairs.some((p) => p.fg === "foreground" && p.bg === "background");
    if (isRoot && !allClear(fg)) rootPairFailed = true;
  }

  return { values, rootPairFailed };
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test compile-repair`
  Expected: PASS (all `compile-repair.test.ts` cases green).

- [ ] **Step 5: Commit** — `git add packages/theming/src/compile/repair.ts packages/theming/test/compile-repair.test.ts && git commit -m "feat(theming): compile repair — fg-moves/bg-held contrast repair, ring multi-pair, root-pair hard-reject (Plan 02 §3.1 law 2-3/§4.5 job 2)"`

---

### Task 6: `compile(draft, manifest)` — the four jobs, base canvas, locked pins, dark ladder

**Files:**
- Create: `packages/theming/src/compile/index.ts`
- Modify: `packages/theming/src/index.ts` (barrel re-export)
- Test: `packages/theming/test/compile.test.ts`

**Interfaces:**
- Consumes (Plan 01): `type AppManifest`, `type EmitContract`, `SHADCN_CAN` (`@invariance/theming/manifest`); `type RoleGraph`, `type RoleId`, `type SeedId`, `getRoleGraph`, `ivRoles1` (`@invariance/theming/roles`); `type StyleSpec`, `type Oklch` (`@invariance/theming/spec`).
- Consumes (this plan): `getRampProfile` (Task 1); `toOklch`, `emitValue` (Task 2); `seedsInDraft`, `affectedClosure`, `topoOrder` (Task 3); `deriveRole`, `type DeriveCtx` (Task 4); `repairContrast` (Task 5).
- Produces (ledger §5.2 — barrel-exported):
  - `export type CandidateMeta = { vocabVersion: string; profileVersion: string }`
  - `export type CandidateTheme = { light: Record<VarName, string>; dark?: Record<VarName, string>; meta: CandidateMeta }`
  - `export function compile(draft: StyleSpec, manifest: AppManifest): CandidateTheme`

- [ ] **Step 1: Write the failing test** — FULL vitest code in `packages/theming/test/compile.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { compile, type CandidateTheme } from "../src/compile/index.js";
import { SHADCN_CAN } from "../src/manifest/index.js";
import { requiredContrast, ivRoles1, getRoleGraph } from "../src/roles/index.js";
import { toOklch, contrast, emitValue } from "../src/compile/oklch.js";
import type { StyleSpec } from "../src/spec/index.js";

const can = SHADCN_CAN;

// Map a VarName back to its role via the manifest, for assertions.
function roleVar(role: string): string {
  const entry = Object.entries(can.variables).find(([, v]) => v.role === role);
  if (!entry) throw new Error(`no var for role ${role} in SHADCN_CAN`);
  return entry[0];
}

// Re-serialize a base[mode][role] color value through the SAME emit contract the compiler uses, so
// the base-as-canvas property is checked against the byte-exact value the compiler must reproduce.
function emitBaseColor(varName: string): string {
  const role = can.variables[varName]!.role;
  const baseRaw = can.base.light[role]!;
  return emitValue(toOklch(baseRaw), can.variables[varName]!.emit, can.invariants.chromaCap);
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

  it("emits a dark block when the manifest allows dark", () => {
    const out = compile({}, can);
    expect(can.modes.allowed).toContain("dark");
    expect(out.dark).toBeDefined();
  });

  it("dark is its OWN ladder, not inverted light — a re-surfaced draft yields a dark background that is darker than light", () => {
    // Re-seed neutral so BOTH modes re-derive surfaces from their own per-mode ladder (job 3).
    const draft: StyleSpec = { colors: { neutral: toOklch("oklch(0.45 0.02 250)") } };
    const out = compile(draft, can);
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

// helper: a triple emit must be wrapped back into a parseable color for the contrast assertion.
function wrap(value: string, emit: { shape: string; space: string | null }): string {
  if (emit.space === null) return value;
  if (emit.shape === "function") return value;
  // triple → wrap in the space function
  if (emit.space === "hsl") return `hsl(${value})`;
  if (emit.space === "rgb") return `rgb(${value})`;
  return `oklch(${value})`;
}
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test compile.test`
  Expected failure: `Failed to resolve import "../src/compile/index.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code in `packages/theming/src/compile/index.ts`:

```ts
import type { AppManifest } from "../manifest/index.js";
import type { RoleId, SeedId, VarName } from "../roles/index.js";
import { getRoleGraph } from "../roles/index.js";
import type { StyleSpec, Oklch } from "../spec/index.js";
import { getRampProfile } from "../profile/index.js";
import { toOklch, emitValue } from "./oklch.js";
import { seedsInDraft, affectedClosure, topoOrder } from "./closure.js";
import { deriveRole, type DeriveCtx } from "./derive.js";
import { repairContrast } from "./repair.js";

export type CandidateMeta = {
  vocabVersion: string;
  profileVersion: string;
};

export type CandidateTheme = {
  light: Record<VarName, string>;
  dark?: Record<VarName, string>;
  meta: CandidateMeta;
};

type Mode = "light" | "dark";

/** Resolve the seed OKLCH values to use this compile: draft overrides, else manifest defaultSeeds. */
function resolveSeeds(draft: StyleSpec, manifest: AppManifest): Record<SeedId, Oklch> {
  const ds = manifest.defaultSeeds;
  const seeds: Record<SeedId, Oklch> = {
    primary: draft.colors?.primary ?? toOklch(ds.colors.primary),
    accent: draft.colors?.accent ?? toOklch(ds.colors.accent),
    neutral: draft.colors?.neutral ?? toOklch(ds.colors.neutral),
    destructive: draft.colors?.destructive ?? toOklch(ds.colors.destructive),
    radius: { l: draft.radius ?? ds.radius, c: 0, h: 0 },
  };
  return seeds;
}

/** Compile one mode: expand the affected closure (base verbatim elsewhere), repair, return OKLCH per role. */
function compileMode(
  mode: Mode,
  draft: StyleSpec,
  manifest: AppManifest,
): Record<RoleId, Oklch> {
  const graph = getRoleGraph(manifest.vocabVersion);
  const profile = getRampProfile(manifest.profileVersion);
  const modeProfile = mode === "light" ? profile.light : profile.dark;
  const baseMode = mode === "light" ? manifest.base.light : (manifest.base.dark ?? manifest.base.light);

  const seeds = resolveSeeds(draft, manifest);
  const affected = affectedClosure(seedsInDraft(draft), graph);

  const ctx: DeriveCtx = {
    mode,
    profile: modeProfile,
    graph,
    tier: manifest.invariants.contrastTier,
    seeds,
    resolved: {} as Record<RoleId, Oklch>,
    radiusOffsets: profile.radiusOffsets,
  };

  // Job 1: expand. base is the canvas — every role starts as its parsed base value, then affected
  // roles are re-derived in topological order. Typography picks are excluded from the OKLCH path.
  const values: Record<RoleId, Oklch> = {};
  for (const [role, def] of Object.entries(graph.roles)) {
    if (def.kind === "typography") continue;
    const baseVal = baseMode[role];
    if (baseVal !== undefined) values[role] = def.kind === "dimension" ? dimOklch(baseVal) : toOklch(baseVal);
  }
  for (const role of topoOrder(affected, graph)) {
    if (graph.roles[role]?.kind === "typography") continue;
    ctx.resolved = values;
    values[role] = deriveRole(role, ctx);
  }

  // Job 2: contrast repair (fg moves, bg held, seeds fixed; ring multi-pair; root-pair hard-reject).
  ctx.resolved = values;
  const { values: repaired } = repairContrast(values, ctx);
  return repaired;
}

/** A dimension base value (e.g. "0.5rem" or "8px" or "8") parsed to px in .l. */
function dimOklch(raw: string): Oklch {
  const m = raw.trim().match(/^(-?[\d.]+)\s*(px|rem|em)?$/);
  const n = m ? parseFloat(m[1]!) : 0;
  const px = m && m[2] === "rem" ? n * 16 : n; // rem→px at the 16px root default
  return { l: px, c: 0, h: 0 };
}

/** Serialize one mode's resolved OKLCH values to VarName→string per each var's emit contract.
 * Locked derived roles are written LAST, copying serialized base verbatim. */
function serializeMode(
  mode: Mode,
  values: Record<RoleId, Oklch>,
  manifest: AppManifest,
): Record<VarName, string> {
  const baseMode = mode === "light" ? manifest.base.light : (manifest.base.dark ?? manifest.base.light);
  const graph = getRoleGraph(manifest.vocabVersion);
  const locks = new Set(manifest.invariants.locks);
  const out: Record<VarName, string> = {};

  for (const [varName, def] of Object.entries(manifest.variables)) {
    const role = def.role;
    if (graph.roles[role]?.kind === "typography") {
      // typography is a font-stack pick resolved outside OKLCH; emit base verbatim for v1.
      const baseVal = baseMode[role];
      if (baseVal !== undefined) out[varName] = baseVal;
      continue;
    }
    const v = values[role];
    if (v === undefined) continue;
    out[varName] = emitValue(v, def.emit, manifest.invariants.chromaCap);
  }

  // Locked derived roles written last, verbatim from serialized base.
  for (const [varName, def] of Object.entries(manifest.variables)) {
    if (locks.has(def.role)) {
      const baseVal = baseMode[def.role];
      if (baseVal !== undefined) {
        // re-serialize base through the emit contract for byte-stable verbatim.
        const kind = graph.roles[def.role]?.kind;
        const parsed = kind === "dimension" ? dimOklch(baseVal) : kind === "typography" ? undefined : toOklch(baseVal);
        out[varName] = parsed ? emitValue(parsed, def.emit, manifest.invariants.chromaCap) : baseVal;
      }
    }
  }
  return out;
}

/** compile(draft, manifest) → CandidateTheme. Pure: same inputs → byte-identical output. */
export function compile(draft: StyleSpec, manifest: AppManifest): CandidateTheme {
  const light = serializeMode("light", compileMode("light", draft, manifest), manifest);
  const result: CandidateTheme = {
    light,
    meta: { vocabVersion: manifest.vocabVersion, profileVersion: manifest.profileVersion },
  };
  if (manifest.modes.allowed.includes("dark")) {
    result.dark = serializeMode("dark", compileMode("dark", draft, manifest), manifest);
  }
  return result;
}
```

- [ ] **Step 4: Wire the barrel** — Modify `packages/theming/src/index.ts` to add (append these two lines to the existing barrel; Plan 01 created the file with the roles/manifest/spec/session re-exports):

```ts
export * from "./profile/index.js";
export * from "./compile/index.js";
```

- [ ] **Step 5: Run tests, verify pass** — `pnpm -F @invariance/theming test compile.test`
  Expected: PASS (all `compile.test.ts` cases green).

- [ ] **Step 6: Commit** — `git add packages/theming/src/compile/index.ts packages/theming/src/index.ts packages/theming/test/compile.test.ts && git commit -m "feat(theming): compile(draft, manifest) — base canvas + closure expand + repair + dark ladder + emit serialize + locked pins (Plan 02 §4.5)"`

---

### Task 7: Golden-file the serialized output for canned StyleSpecs on the shadcn can

**Files:**
- Create: `packages/theming/test/__golden__/.gitkeep`
- Test: `packages/theming/test/compile-golden.test.ts`

**Interfaces:**
- Consumes (this plan, Task 6): `compile`, `type CandidateTheme`.
- Consumes (Plan 01): `SHADCN_CAN` (`@invariance/theming/manifest`); `toOklch` is internal — use `parseSpec` from `@invariance/theming/spec` to build canned drafts so the test exercises the same wall the pipeline uses.
- Produces: golden JSON files under `packages/theming/test/__golden__/` (the format-contract + profile-number regression net per §8); no exported runtime code.

- [ ] **Step 1: Write the failing test** — FULL vitest code in `packages/theming/test/compile-golden.test.ts`. This uses vitest's `toMatchFileSnapshot` so each canned StyleSpec's full serialized output is a reviewable file diff:

```ts
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
  { name: "primary-recolor", json: { colors: { primary: "oklch(0.55 0.2 20)" } } },
  { name: "neutral-resurface", json: { colors: { neutral: "oklch(0.45 0.02 250)" } } },
  { name: "radius-bump", json: { radius: 12 } },
  { name: "full-rebrand", json: { colors: { primary: "oklch(0.6 0.2 280)", accent: "oklch(0.7 0.12 160)", destructive: "oklch(0.55 0.22 25)" } } },
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
    const d = draftFrom({ colors: { primary: "oklch(0.55 0.2 20)" } });
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
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test compile-golden`
  Expected failure on first run: vitest reports the snapshot files do not exist (`Snapshot \`...\` mismatched` / `__golden__/empty-base.json` written). Because `toMatchFileSnapshot` writes on first run, run once more WITHOUT `--update` to confirm: the second run must PASS. If the FIRST run errors instead with `Failed to resolve import "../src/spec/index.js"` then Plan 01 is not yet merged — block on Plan 01.

- [ ] **Step 3: Create the golden directory placeholder** — Create `packages/theming/test/__golden__/.gitkeep` with content:

```
# golden serialized compile output — reviewable diffs per §8. Generated by compile-golden.test.ts.
```

- [ ] **Step 4: Generate and verify the golden files** — run twice; the first writes the snapshots, the second confirms stability:
  - `pnpm -F @invariance/theming test compile-golden` (writes `__golden__/*.json`)
  - `pnpm -F @invariance/theming test compile-golden`
  Expected on the second run: PASS (5 snapshot cases + the determinism case all green, no files rewritten).

- [ ] **Step 5: Inspect one golden file for sanity** — open `packages/theming/test/__golden__/empty-base.json` and confirm `meta.vocabVersion === "iv-roles-1"`, `meta.profileVersion === "iv-profile-1"`, and that color vars are serialized in the `SHADCN_CAN` emit shape (e.g. hsl-triple `"0 0% 100%"`, not hex). This is the human review the golden-file strategy exists for.

- [ ] **Step 6: Commit** — `git add packages/theming/test/compile-golden.test.ts packages/theming/test/__golden__ && git commit -m "test(theming): golden-file compiler serialized output for canned StyleSpecs on the shadcn can (Plan 02 §8)"`

---

### Task 8: Full-suite green + typecheck (integration gate for the plan)

**Files:**
- Modify: none (verification task only).
- Test: runs the whole `@invariance/theming` suite + typecheck.

**Interfaces:**
- Consumes: every module produced by Tasks 1–7.
- Produces: a green package — the contract Plans 03 (verify) and 04 (artifact) build on (`compile`, `CandidateTheme`, `ivProfile1`, `getRampProfile`).

- [ ] **Step 1: Run the full package test suite** — `pnpm -F @invariance/theming test`
  Expected: PASS — `profile.test.ts`, `compile-oklch.test.ts`, `compile-closure.test.ts`, `compile-derive.test.ts`, `compile-repair.test.ts`, `compile.test.ts`, `compile-golden.test.ts` all green (plus Plan 01's suites if co-located).

- [ ] **Step 2: Typecheck the package** — `pnpm -F @invariance/theming typecheck`
  Expected: PASS — no `tsc` errors. (Strict mode, `noUncheckedIndexedAccess`: confirm every `Record` index access in the new files is guarded with `!`/`?? default` as written.)

- [ ] **Step 3: Confirm the barrel exports the public surface** — verify the symbols Plans 03/04/05 import resolve from the package root by running this one-off check:

```ts
// packages/theming/test/barrel-surface.test.ts
import { describe, it, expect } from "vitest";
import * as theming from "../src/index.js";

describe("@invariance/theming barrel surface (Plan 02 additions)", () => {
  it("exports the profile contract", () => {
    expect(theming.PROFILE_VERSION).toBe("iv-profile-1");
    expect(theming.ivProfile1).toBeDefined();
    expect(typeof theming.getRampProfile).toBe("function");
  });
  it("exports compile + CandidateTheme runtime entry", () => {
    expect(typeof theming.compile).toBe("function");
  });
});
```

  Run: `pnpm -F @invariance/theming test barrel-surface`
  Expected: PASS.

- [ ] **Step 4: Commit** — `git add packages/theming/test/barrel-surface.test.ts && git commit -m "test(theming): barrel-surface guard for Plan 02 profile + compile exports"`

---
