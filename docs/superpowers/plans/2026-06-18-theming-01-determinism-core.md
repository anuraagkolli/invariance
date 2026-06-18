# Determinism Core — Role Graph, Manifest, StyleSpec Wall, Merge, Diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, plane-agnostic deterministic foundation of `@invariance/theming` — the `iv-roles-1` role graph as data, the `f(tier,category)` contrast table, the `AppManifest` zod schema with its full blocking `superRefine` layer, the closed `StyleSpec` wall with parse-don't-validate color parsing + lock projection, the structural sentinel-normalizing `mergeDelta`/`canonicalize`, and the three-state `diffSpecs`.

**Architecture:** A new `packages/theming` workspace package exports TS source directly (ESM, no build step). It is consumed by BOTH the control plane (authoring/preview) and the data plane (apply), so it carries zero runtime I/O and zero LLM. zod schemas are the source of truth (export both `XSchema`-style value and `type X = z.infer<…>`); cross-field integrity lives in `superRefine`. OKLCH color math (parse, convert, gamut-map, WCAG contrast) goes through culori.

**Tech Stack:** TypeScript strict + ESM, zod (validation), culori (OKLCH math), vitest (colocated tests).

## Global Constraints

- pnpm workspaces + turborepo; pnpm ONLY (never npm/yarn).
- TypeScript strict mode, ESM (`"type": "module"`).
- Workspace packages export TS source directly (`"exports": { ".": "./src/index.ts" }`); no build step until published externally.
- zod is the source of truth: export both `XSchema` and `type X = z.infer<typeof XSchema>`. Cross-schema integrity lives in `superRefine` blocks.
- vitest; tests colocated under each package's `test/` (or alongside source). Run e.g. `pnpm -F @invariance/theming test`.
- OKLCH color math via culori (parse, convert, gamut-map, WCAG contrast).
- Artifact content-addressing + signing: ed25519 via `node:crypto`, canonical JSON (sorted keys). (Not used by this plan, but the package stays compatible.)
- DETERMINISM: `compile()`/`verify()`/`renderStyleText()`/`mergeDelta()`/`diffSpecs()` must be pure — no `Date.now()`, `Math.random()`, or I/O. Stamp timestamps outside the pure core.
- Package layout (this plan owns the `@invariance/theming` core modules):
  - `packages/theming/  (@invariance/theming)` — pure, plane-agnostic deterministic core.
  - `packages/theming/src/roles/` — RoleGraph types + the `iv-roles-1` instance + `f(tier,category)`.
  - `packages/theming/src/manifest/` — `AppManifest` zod schema + `superRefine` + shadcn "can" fixture.
  - `packages/theming/src/spec/` — `StyleSpec` zod schema, `OklchColor`, `FontStackId`, `parseSpec` + lock projection.
  - `packages/theming/src/session/` — `mergeDelta`, `canonicalize`, `diffSpecs` (session state machine is Plan 05).
  - `packages/theming/src/profile/` — ramp profile types (Plan 02 owns; not in this plan).
  - `packages/theming/src/compile/` — `compile(draft, manifest)` (Plan 02; not in this plan).
  - `packages/theming/src/verify/` — `verify(theme, manifest)` (Plan 03; not in this plan).
  - `packages/theming/src/artifact/` — artifact/applier/pointer (Plan 04; not in this plan).
  - `packages/theming/src/index.ts` — barrel re-export of all the above.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/theming/package.json` | Package manifest: name `@invariance/theming`, ESM, TS-source exports, deps zod + culori, devdeps vitest. |
| `packages/theming/tsconfig.json` | Extends repo base tsconfig; includes `src`. |
| `packages/theming/vitest.config.ts` | vitest config (node env, include `src/**/*.test.ts`). |
| `packages/theming/src/roles/types.ts` | Shared primitive aliases (`SeedId`/`RoleId`/`StepId`/`VarName`/`Kind`/`Mode`/`SpecMode`/`ContrastCategory`/`ContrastTier`/`FontStackId`), `Derivation` union, `ContrastPair`, `RoleGraph`. |
| `packages/theming/src/roles/iv-roles-1.ts` | The `ivRoles1` RoleGraph instance (27 roles + derivations + contrastPairs) and `VOCAB_VERSION`. |
| `packages/theming/src/roles/graph.ts` | `getRoleGraph(vocabVersion)` lookup; law predicates (`isModePolarized`, `classifySeedOrDerived`, `repairTarget`). |
| `packages/theming/src/roles/contrast.ts` | `requiredContrast(tier, category)` — the exact §6 f-table. |
| `packages/theming/src/roles/index.ts` | Barrel for `roles/`. |
| `packages/theming/src/spec/oklch.ts` | `Oklch` type, `OklchColor` parse-don't-validate zod schema (clamp chroma, reject breakout). |
| `packages/theming/src/spec/style-spec.ts` | `MAX_RADIUS_PX`, `FontStackId` leaf, `StyleSpec` closed schema. |
| `packages/theming/src/spec/parse-spec.ts` | `parseSpec(json, manifest)` — the wall, with seed-lock projection + font-allowlist check; `ParseResult`/`WallFailure`/`WallFailureCode`. |
| `packages/theming/src/spec/index.ts` | Barrel for `spec/`. |
| `packages/theming/src/manifest/schema.ts` | `Shape`/`Space`/`EmitContract`, `AppManifest` zod schema + full named `superRefine` checks. |
| `packages/theming/src/manifest/shadcn-can.ts` | `SHADCN_CAN` — a real AA-passing shadcn "can" manifest fixture. |
| `packages/theming/src/manifest/index.ts` | Barrel for `manifest/`. |
| `packages/theming/src/session/merge.ts` | `mergeDelta(draft, delta)` + `canonicalize(spec)` (structural, sentinel-normalizing). |
| `packages/theming/src/session/diff.ts` | `diffSpecs(prev, next, manifest)` + `FieldDiff` (three-state, resolved values). |
| `packages/theming/src/session/index.ts` | Barrel for `session/` (re-exports merge + diff). |
| `packages/theming/src/index.ts` | Top-level barrel re-export of roles + spec + manifest + session. |

---

### Task 1: Package scaffold (`@invariance/theming`)

**Files:**
- Create: `packages/theming/package.json`
- Create: `packages/theming/tsconfig.json`
- Create: `packages/theming/vitest.config.ts`
- Create: `packages/theming/src/index.ts`
- Test: `packages/theming/src/scaffold.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the `@invariance/theming` workspace package importable by later tasks/plans; a top-level `src/index.ts` barrel.

- [ ] **Step 1: Write the failing test** — FULL vitest code:

```ts
// packages/theming/src/scaffold.test.ts
import { describe, it, expect } from "vitest";
import { wcagContrast } from "culori";
import { z } from "zod";

describe("theming package scaffold", () => {
  it("loads culori (WCAG contrast white-on-black ≈ 21)", () => {
    const ratio = wcagContrast("#ffffff", "#000000");
    expect(ratio).toBeGreaterThan(20.9);
    expect(ratio).toBeLessThan(21.1);
  });

  it("loads zod", () => {
    const schema = z.object({ a: z.number() });
    expect(schema.parse({ a: 1 })).toEqual({ a: 1 });
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test`
  Expected failure: pnpm errors with `No projects matched the filters "@invariance/theming"` (the package does not exist yet).

- [ ] **Step 3: Minimal implementation** — create the four scaffold files:

```jsonc
// packages/theming/package.json
{
  "name": "@invariance/theming",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./roles": "./src/roles/index.ts",
    "./manifest": "./src/manifest/index.ts",
    "./spec": "./src/spec/index.ts",
    "./session": "./src/session/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "culori": "^4",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

```jsonc
// packages/theming/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

```ts
// packages/theming/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

```ts
// packages/theming/src/index.ts
// Barrel re-export of the deterministic core. Submodules are added as tasks land.
export {};
```

- [ ] **Step 4: Install + run tests, verify pass** — `pnpm install && pnpm -F @invariance/theming test`
  Expected: PASS (2 passing tests). If `tsconfig.base.json` lacks a `culori` type and culori is untyped, the test still runs since vitest transpiles per-file; culori ships its own types in v4.

- [ ] **Step 5: Commit** — `git add packages/theming/package.json packages/theming/tsconfig.json packages/theming/vitest.config.ts packages/theming/src/index.ts packages/theming/src/scaffold.test.ts pnpm-lock.yaml && git commit -m "feat(theming): scaffold @invariance/theming package (zod + culori, TS-source ESM)"`

---

### Task 2: Shared primitive type aliases + Derivation / ContrastPair / RoleGraph types

**Files:**
- Create: `packages/theming/src/roles/types.ts`
- Test: `packages/theming/src/roles/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (verbatim from ledger §1, §2.2, §2.3):
  ```ts
  export type SeedId = string;
  export type RoleId = string;
  export type StepId = string;
  export type VarName = string;
  export type Kind = "color" | "dimension" | "typography";
  export type Mode = "light" | "dark";
  export type SpecMode = "light" | "dark" | "both";
  export type ContrastCategory = "text" | "large-text" | "ui";
  export type ContrastTier = "AA" | "AAA";
  export type FontStackId = string;
  export type Derivation =
    | { kind: "seed"; seed: SeedId }
    | { kind: "surface-anchor"; seed: "neutral" }
    | { kind: "surface-step"; seed: "neutral"; step: StepId }
    | { kind: "line-step"; seed: "neutral"; step: StepId }
    | { kind: "foreground-of"; bg: RoleId; strategy: "maximize-contrast" | "minimum-legible" }
    | { kind: "accent-line"; seed: SeedId }
    | { kind: "offset"; seed: "radius"; step: StepId }
    | { kind: "pick"; axis: "display" | "body" | "mono" };
  export type ContrastPair = { fg: RoleId; bg: RoleId; category: ContrastCategory };
  export type RoleGraph = {
    seeds: SeedId[];
    roles: Record<RoleId, { kind: Kind; derivation: Derivation }>;
    contrastPairs: ContrastPair[];
  };
  ```

- [ ] **Step 1: Write the failing test** — FULL vitest code:

```ts
// packages/theming/src/roles/types.test.ts
import { describe, it, expectTypeOf } from "vitest";
import type {
  SeedId,
  RoleId,
  StepId,
  VarName,
  Kind,
  Mode,
  SpecMode,
  ContrastCategory,
  ContrastTier,
  FontStackId,
  Derivation,
  ContrastPair,
  RoleGraph,
} from "./types.js";

describe("roles/types", () => {
  it("primitive aliases resolve to string / literal unions", () => {
    expectTypeOf<SeedId>().toEqualTypeOf<string>();
    expectTypeOf<RoleId>().toEqualTypeOf<string>();
    expectTypeOf<StepId>().toEqualTypeOf<string>();
    expectTypeOf<VarName>().toEqualTypeOf<string>();
    expectTypeOf<FontStackId>().toEqualTypeOf<string>();
    expectTypeOf<Kind>().toEqualTypeOf<"color" | "dimension" | "typography">();
    expectTypeOf<Mode>().toEqualTypeOf<"light" | "dark">();
    expectTypeOf<SpecMode>().toEqualTypeOf<"light" | "dark" | "both">();
    expectTypeOf<ContrastCategory>().toEqualTypeOf<"text" | "large-text" | "ui">();
    expectTypeOf<ContrastTier>().toEqualTypeOf<"AA" | "AAA">();
  });

  it("Derivation is a discriminated union keyed on kind", () => {
    const d: Derivation = { kind: "foreground-of", bg: "card", strategy: "maximize-contrast" };
    expectTypeOf(d).toMatchTypeOf<Derivation>();
    const pick: Derivation = { kind: "pick", axis: "body" };
    expectTypeOf(pick).toMatchTypeOf<Derivation>();
  });

  it("RoleGraph composes roles + contrastPairs", () => {
    const graph: RoleGraph = {
      seeds: ["primary"],
      roles: { primary: { kind: "color", derivation: { kind: "seed", seed: "primary" } } },
      contrastPairs: [{ fg: "foreground", bg: "background", category: "text" }],
    };
    expectTypeOf(graph.contrastPairs[0]).toMatchTypeOf<ContrastPair>();
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test src/roles/types.test.ts`
  Expected failure: `Failed to resolve import "./types.js"` (the module does not exist).

- [ ] **Step 3: Minimal implementation** — FULL code:

```ts
// packages/theming/src/roles/types.ts

// Branded-ish string aliases. v1 keeps them plain string for ergonomics; the zod schemas enforce
// membership against the live RoleGraph / manifest where it matters.
export type SeedId = string; // ∈ RoleGraph.seeds
export type RoleId = string; // ∈ keys of RoleGraph.roles (the 27 output roles in iv-roles-1)
export type StepId = string; // ramp step identifier consumed by surface-step/line-step/offset derivations
export type VarName = string; // a CSS custom property name including leading "--", e.g. "--background"

export type Kind = "color" | "dimension" | "typography";

export type Mode = "light" | "dark"; // a RESOLVED mode (apply-time, artifact, base)
export type SpecMode = "light" | "dark" | "both"; // the StyleSpec/compile-time mode axis ("both" is compile-only)

export type ContrastCategory = "text" | "large-text" | "ui";
export type ContrastTier = "AA" | "AAA";
export type FontStackId = string; // an index/key into manifest.invariants.allowedFonts — NEVER free text

export type Derivation =
  | { kind: "seed"; seed: SeedId } // role IS a seed (primary, accent, destructive, radius)
  | { kind: "surface-anchor"; seed: "neutral" } // background — the mode-dependent base surface
  | { kind: "surface-step"; seed: "neutral"; step: StepId } // card, popover, muted, secondary
  | { kind: "line-step"; seed: "neutral"; step: StepId } // border, input
  | { kind: "foreground-of"; bg: RoleId; strategy: "maximize-contrast" | "minimum-legible" }
  | { kind: "accent-line"; seed: SeedId } // ring
  | { kind: "offset"; seed: "radius"; step: StepId } // radius-sm/md/lg/xl
  | { kind: "pick"; axis: "display" | "body" | "mono" };

export type ContrastPair = { fg: RoleId; bg: RoleId; category: ContrastCategory };

export type RoleGraph = {
  seeds: SeedId[]; // StyleSpec INPUT axes — small
  roles: Record<RoleId, { kind: Kind; derivation: Derivation }>;
  contrastPairs: ContrastPair[];
};
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test src/roles/types.test.ts`
  Expected: PASS (3 passing tests).

- [ ] **Step 5: Commit** — `git add packages/theming/src/roles/types.ts packages/theming/src/roles/types.test.ts && git commit -m "feat(theming): shared primitive aliases + Derivation/ContrastPair/RoleGraph types"`

---

### Task 3: `requiredContrast(tier, category)` — the f-table

**Files:**
- Create: `packages/theming/src/roles/contrast.ts`
- Test: `packages/theming/src/roles/contrast.test.ts`

**Interfaces:**
- Consumes: `ContrastTier`, `ContrastCategory` from `./types.js`.
- Produces: `export function requiredContrast(tier: ContrastTier, category: ContrastCategory): number;`

- [ ] **Step 1: Write the failing test** — FULL vitest code (exact §6 table):

```ts
// packages/theming/src/roles/contrast.test.ts
import { describe, it, expect } from "vitest";
import { requiredContrast } from "./contrast.js";

describe("requiredContrast (f-table §6)", () => {
  it("AA row", () => {
    expect(requiredContrast("AA", "text")).toBe(4.5);
    expect(requiredContrast("AA", "large-text")).toBe(3.0);
    expect(requiredContrast("AA", "ui")).toBe(3.0);
  });

  it("AAA row", () => {
    expect(requiredContrast("AAA", "text")).toBe(7.0);
    expect(requiredContrast("AAA", "large-text")).toBe(4.5);
    expect(requiredContrast("AAA", "ui")).toBe(3.0); // ui stays 3.0 at AAA — WCAG does not raise non-text contrast
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test src/roles/contrast.test.ts`
  Expected failure: `Failed to resolve import "./contrast.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code:

```ts
// packages/theming/src/roles/contrast.ts
import type { ContrastTier, ContrastCategory } from "./types.js";

// The exact §6 ratio table. Pure lookup; both compiler (Plan 02) and verifier (Plan 03) call this.
// Typed with all keys present so the two-level lookup is total (the repo enables
// noUncheckedIndexedAccess; a non-Record literal would otherwise widen the result to `number |
// undefined`). ContrastTier/ContrastCategory are closed unions, so this map is exhaustive by type.
const F_TABLE: Record<ContrastTier, Record<ContrastCategory, number>> = {
  AA: { text: 4.5, "large-text": 3.0, ui: 3.0 },
  AAA: { text: 7.0, "large-text": 4.5, ui: 3.0 },
};

export function requiredContrast(tier: ContrastTier, category: ContrastCategory): number {
  // noUncheckedIndexedAccess makes F_TABLE[tier][category] `number | undefined`; the unions are
  // exhaustive over F_TABLE so the value is always present — assert non-undefined for the return type.
  return F_TABLE[tier][category]!;
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test src/roles/contrast.test.ts`
  Expected: PASS (2 passing tests).

- [ ] **Step 5: Commit** — `git add packages/theming/src/roles/contrast.ts packages/theming/src/roles/contrast.test.ts && git commit -m "feat(theming): requiredContrast f(tier,category) table (§6)"`

---

### Task 4: The `iv-roles-1` RoleGraph instance (27 roles, derivations, contrastPairs)

**Files:**
- Create: `packages/theming/src/roles/iv-roles-1.ts`
- Test: `packages/theming/src/roles/iv-roles-1.test.ts`

**Interfaces:**
- Consumes: `RoleGraph`, `Derivation`, `ContrastPair`, `RoleId` from `./types.js`.
- Produces:
  ```ts
  export const VOCAB_VERSION = "iv-roles-1" as const;
  export const ivRoles1: RoleGraph;
  ```

- [ ] **Step 1: Write the failing test** — FULL vitest code (asserts every §3 table entry):

```ts
// packages/theming/src/roles/iv-roles-1.test.ts
import { describe, it, expect } from "vitest";
import { ivRoles1, VOCAB_VERSION } from "./iv-roles-1.js";

describe("ivRoles1 (the §3 shadcn instance)", () => {
  it("vocab version constant", () => {
    expect(VOCAB_VERSION).toBe("iv-roles-1");
  });

  it("seeds: brand + ramp + dimension + axes + typography picks; neutral & density present", () => {
    expect(ivRoles1.seeds).toEqual([
      "primary",
      "accent",
      "neutral",
      "destructive",
      "radius",
      "density",
      "mode",
      "display",
      "body",
      "mono",
    ]);
  });

  it("has exactly the 27 core output roles", () => {
    expect(Object.keys(ivRoles1.roles).sort()).toEqual(
      [
        "primary",
        "accent",
        "destructive",
        "background",
        "card",
        "popover",
        "muted",
        "secondary",
        "border",
        "input",
        "ring",
        "foreground",
        "card-fg",
        "popover-fg",
        "secondary-fg",
        "primary-fg",
        "accent-fg",
        "destructive-fg",
        "muted-fg",
        "radius",
        "radius-sm",
        "radius-md",
        "radius-lg",
        "radius-xl",
        "font-display",
        "font-body",
        "font-mono",
      ].sort(),
    );
    expect(Object.keys(ivRoles1.roles)).toHaveLength(27);
  });

  it("neutral is seed-only (no --neutral output role)", () => {
    expect(ivRoles1.seeds).toContain("neutral");
    expect(ivRoles1.roles["neutral"]).toBeUndefined();
  });

  it("brand seeds derive as {kind:seed}", () => {
    for (const r of ["primary", "accent", "destructive", "radius"]) {
      expect(ivRoles1.roles[r]!.derivation).toEqual({ kind: "seed", seed: r });
    }
    expect(ivRoles1.roles["primary"]!.kind).toBe("color");
    expect(ivRoles1.roles["radius"]!.kind).toBe("dimension");
  });

  it("surfaces: background is surface-anchor; card/popover/muted/secondary are surface-step", () => {
    expect(ivRoles1.roles["background"]!.derivation).toEqual({ kind: "surface-anchor", seed: "neutral" });
    for (const r of ["card", "popover", "muted", "secondary"]) {
      const d = ivRoles1.roles[r]!.derivation;
      expect(d.kind).toBe("surface-step");
      expect((d as { seed: string }).seed).toBe("neutral");
    }
  });

  it("lines: border/input are line-step(neutral)", () => {
    for (const r of ["border", "input"]) {
      const d = ivRoles1.roles[r]!.derivation;
      expect(d.kind).toBe("line-step");
      expect((d as { seed: string }).seed).toBe("neutral");
    }
  });

  it("ring is accent-line(primary)", () => {
    expect(ivRoles1.roles["ring"]!.derivation).toEqual({ kind: "accent-line", seed: "primary" });
  });

  it("foregrounds bind to their bg via maximize-contrast, muted-fg via minimum-legible", () => {
    const bind: Record<string, string> = {
      foreground: "background",
      "card-fg": "card",
      "popover-fg": "popover",
      "secondary-fg": "secondary",
      "primary-fg": "primary",
      "accent-fg": "accent",
      "destructive-fg": "destructive",
    };
    for (const [fg, bg] of Object.entries(bind)) {
      expect(ivRoles1.roles[fg]!.derivation).toEqual({
        kind: "foreground-of",
        bg,
        strategy: "maximize-contrast",
      });
    }
    expect(ivRoles1.roles["muted-fg"]!.derivation).toEqual({
      kind: "foreground-of",
      bg: "muted",
      strategy: "minimum-legible",
    });
  });

  it("radius offsets derive from radius seed", () => {
    for (const step of ["sm", "md", "lg", "xl"]) {
      expect(ivRoles1.roles[`radius-${step}`]!.derivation).toEqual({
        kind: "offset",
        seed: "radius",
        step,
      });
      expect(ivRoles1.roles[`radius-${step}`]!.kind).toBe("dimension");
    }
  });

  it("typography picks", () => {
    expect(ivRoles1.roles["font-display"]!.derivation).toEqual({ kind: "pick", axis: "display" });
    expect(ivRoles1.roles["font-body"]!.derivation).toEqual({ kind: "pick", axis: "body" });
    expect(ivRoles1.roles["font-mono"]!.derivation).toEqual({ kind: "pick", axis: "mono" });
    expect(ivRoles1.roles["font-body"]!.kind).toBe("typography");
  });

  it("contrastPairs: text/large-text/ui exactly per §3 (border/input NOT checked)", () => {
    const text = ivRoles1.contrastPairs.filter((p) => p.category === "text");
    expect(text.map((p) => [p.fg, p.bg])).toEqual([
      ["foreground", "background"],
      ["card-fg", "card"],
      ["popover-fg", "popover"],
      ["primary-fg", "primary"],
      ["secondary-fg", "secondary"],
      ["accent-fg", "accent"],
      ["destructive-fg", "destructive"],
    ]);
    const large = ivRoles1.contrastPairs.filter((p) => p.category === "large-text");
    expect(large.map((p) => [p.fg, p.bg])).toEqual([["muted-fg", "muted"]]);
    const ui = ivRoles1.contrastPairs.filter((p) => p.category === "ui");
    expect(ui.map((p) => [p.fg, p.bg])).toEqual([
      ["ring", "background"],
      ["ring", "card"],
      ["ring", "popover"],
    ]);
    // border/input never appear as a pair member
    for (const p of ivRoles1.contrastPairs) {
      expect(p.fg).not.toBe("border");
      expect(p.bg).not.toBe("border");
      expect(p.fg).not.toBe("input");
      expect(p.bg).not.toBe("input");
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test src/roles/iv-roles-1.test.ts`
  Expected failure: `Failed to resolve import "./iv-roles-1.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code:

```ts
// packages/theming/src/roles/iv-roles-1.ts
import type { RoleGraph, Derivation, ContrastPair } from "./types.js";

export const VOCAB_VERSION = "iv-roles-1" as const;

// Helpers keep the table readable without changing the materialized data.
const seed = (s: string): Derivation => ({ kind: "seed", seed: s });
const surfaceStep = (step: string): Derivation => ({ kind: "surface-step", seed: "neutral", step });
const lineStep = (step: string): Derivation => ({ kind: "line-step", seed: "neutral", step });
const fgOf = (bg: string, strategy: "maximize-contrast" | "minimum-legible"): Derivation => ({
  kind: "foreground-of",
  bg,
  strategy,
});
const offset = (step: string): Derivation => ({ kind: "offset", seed: "radius", step });

export const ivRoles1: RoleGraph = {
  // StyleSpec INPUT axes: brand seeds + ramp seed (neutral) + dimension + axes + typography picks.
  // neutral is seed-only (no --neutral var). density is present-but-empty (zero output roles in v1).
  seeds: ["primary", "accent", "neutral", "destructive", "radius", "density", "mode", "display", "body", "mono"],

  roles: {
    // Brand seeds (both seed and output role)
    primary: { kind: "color", derivation: seed("primary") },
    accent: { kind: "color", derivation: seed("accent") },
    destructive: { kind: "color", derivation: seed("destructive") },

    // Surfaces
    background: { kind: "color", derivation: { kind: "surface-anchor", seed: "neutral" } },
    card: { kind: "color", derivation: surfaceStep("card") },
    popover: { kind: "color", derivation: surfaceStep("popover") },
    muted: { kind: "color", derivation: surfaceStep("muted") },
    secondary: { kind: "color", derivation: surfaceStep("secondary") },

    // Lines (decorative — NOT contrast-checked)
    border: { kind: "color", derivation: lineStep("border") },
    input: { kind: "color", derivation: lineStep("input") },

    // Focus
    ring: { kind: "color", derivation: { kind: "accent-line", seed: "primary" } },

    // Foregrounds (computed against their bg in the active mode)
    foreground: { kind: "color", derivation: fgOf("background", "maximize-contrast") },
    "card-fg": { kind: "color", derivation: fgOf("card", "maximize-contrast") },
    "popover-fg": { kind: "color", derivation: fgOf("popover", "maximize-contrast") },
    "secondary-fg": { kind: "color", derivation: fgOf("secondary", "maximize-contrast") },
    "primary-fg": { kind: "color", derivation: fgOf("primary", "maximize-contrast") },
    "accent-fg": { kind: "color", derivation: fgOf("accent", "maximize-contrast") },
    "destructive-fg": { kind: "color", derivation: fgOf("destructive", "maximize-contrast") },
    "muted-fg": { kind: "color", derivation: fgOf("muted", "minimum-legible") },

    // Dimension
    radius: { kind: "dimension", derivation: seed("radius") },
    "radius-sm": { kind: "dimension", derivation: offset("sm") },
    "radius-md": { kind: "dimension", derivation: offset("md") },
    "radius-lg": { kind: "dimension", derivation: offset("lg") },
    "radius-xl": { kind: "dimension", derivation: offset("xl") },

    // Typography
    "font-display": { kind: "typography", derivation: { kind: "pick", axis: "display" } },
    "font-body": { kind: "typography", derivation: { kind: "pick", axis: "body" } },
    "font-mono": { kind: "typography", derivation: { kind: "pick", axis: "mono" } },
  },

  // Verifier's check set / compiler's repair set. border/input intentionally absent (decorative).
  contrastPairs: [
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
  ] satisfies ContrastPair[],
};
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test src/roles/iv-roles-1.test.ts`
  Expected: PASS (12 passing tests).

- [ ] **Step 5: Commit** — `git add packages/theming/src/roles/iv-roles-1.ts packages/theming/src/roles/iv-roles-1.test.ts && git commit -m "feat(theming): iv-roles-1 RoleGraph instance (27 roles + derivations + contrastPairs)"`

---

### Task 5: `getRoleGraph` lookup + the three-law helper predicates

**Files:**
- Create: `packages/theming/src/roles/graph.ts`
- Create: `packages/theming/src/roles/index.ts`
- Test: `packages/theming/src/roles/graph.test.ts`

**Interfaces:**
- Consumes: `RoleGraph`, `RoleId`, `SeedId`, `Kind`, `Derivation` from `./types.js`; `ivRoles1`, `VOCAB_VERSION` from `./iv-roles-1.js`.
- Produces:
  ```ts
  export function getRoleGraph(vocabVersion: string): RoleGraph; // throws on unknown
  export function isModePolarized(graph: RoleGraph, role: RoleId): boolean; // law 1
  export function classifySeedOrDerived(graph: RoleGraph, id: SeedId | RoleId): "seed" | "derived"; // lock projection
  export function repairTarget(pair: { fg: RoleId; bg: RoleId }): { moves: RoleId; holds: RoleId }; // law 2
  ```
- `roles/index.ts` re-exports types + contrast + iv-roles-1 + graph.

- [ ] **Step 1: Write the failing test** — FULL vitest code:

```ts
// packages/theming/src/roles/graph.test.ts
import { describe, it, expect } from "vitest";
import {
  getRoleGraph,
  isModePolarized,
  classifySeedOrDerived,
  repairTarget,
} from "./graph.js";
import { ivRoles1, VOCAB_VERSION } from "./iv-roles-1.js";

describe("getRoleGraph", () => {
  it("returns ivRoles1 for the pinned version", () => {
    expect(getRoleGraph(VOCAB_VERSION)).toBe(ivRoles1);
  });
  it("throws on an unknown vocab version (retention §9)", () => {
    expect(() => getRoleGraph("iv-roles-99")).toThrow(/unknown vocab/i);
  });
});

describe("isModePolarized (law 1: keyed on kind)", () => {
  it("color roles are mode-polarized", () => {
    expect(isModePolarized(ivRoles1, "background")).toBe(true);
    expect(isModePolarized(ivRoles1, "primary")).toBe(true);
    expect(isModePolarized(ivRoles1, "muted-fg")).toBe(true);
  });
  it("dimension and typography roles are mode-stable", () => {
    expect(isModePolarized(ivRoles1, "radius")).toBe(false);
    expect(isModePolarized(ivRoles1, "radius-md")).toBe(false);
    expect(isModePolarized(ivRoles1, "font-body")).toBe(false);
  });
});

describe("classifySeedOrDerived (lock projection)", () => {
  it("seed-only neutral classifies as seed", () => {
    expect(classifySeedOrDerived(ivRoles1, "neutral")).toBe("seed");
  });
  it("seed-named output role (primary) classifies as seed", () => {
    // primary IS a seed (derivation kind:seed), so a lock on it is a seed lock
    expect(classifySeedOrDerived(ivRoles1, "primary")).toBe("seed");
  });
  it("a derived output role (card) classifies as derived", () => {
    expect(classifySeedOrDerived(ivRoles1, "card")).toBe("derived");
    expect(classifySeedOrDerived(ivRoles1, "ring")).toBe("derived");
  });
  it("density (present-but-empty seed) classifies as seed", () => {
    expect(classifySeedOrDerived(ivRoles1, "density")).toBe("seed");
  });
});

describe("repairTarget (law 2: fg moves, bg holds)", () => {
  it("the fg member moves, the bg member holds", () => {
    expect(repairTarget({ fg: "foreground", bg: "background" })).toEqual({
      moves: "foreground",
      holds: "background",
    });
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test src/roles/graph.test.ts`
  Expected failure: `Failed to resolve import "./graph.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code (two files):

```ts
// packages/theming/src/roles/graph.ts
import type { RoleGraph, RoleId, SeedId } from "./types.js";
import { ivRoles1, VOCAB_VERSION } from "./iv-roles-1.js";

const REGISTRY: Record<string, RoleGraph> = {
  [VOCAB_VERSION]: ivRoles1,
};

// Lookup by version; throws on unknown so a GC'd/typo'd version is loud, not a silent miscompile (§9).
export function getRoleGraph(vocabVersion: string): RoleGraph {
  const graph = REGISTRY[vocabVersion];
  if (!graph) {
    throw new Error(`unknown vocab version: ${vocabVersion}`);
  }
  return graph;
}

// Law 1: mode-polarization keyed on kind. color ⇒ polarized; dimension/typography ⇒ mode-stable.
export function isModePolarized(graph: RoleGraph, role: RoleId): boolean {
  const entry = graph.roles[role];
  if (!entry) {
    throw new Error(`unknown role: ${role}`);
  }
  return entry.kind === "color";
}

// Lock projection: an id is a seed lock iff it is a graph seed OR an output role whose derivation IS
// {kind:"seed"} (a seed-named role like primary). Everything else is a derived-role lock.
export function classifySeedOrDerived(graph: RoleGraph, id: SeedId | RoleId): "seed" | "derived" {
  if (graph.seeds.includes(id)) {
    return "seed";
  }
  const entry = graph.roles[id];
  if (entry && entry.derivation.kind === "seed") {
    return "seed";
  }
  return "derived";
}

// Law 2: the fg member of a failing pair moves (its L); the bg member holds.
export function repairTarget(pair: { fg: RoleId; bg: RoleId }): { moves: RoleId; holds: RoleId } {
  return { moves: pair.fg, holds: pair.bg };
}
```

```ts
// packages/theming/src/roles/index.ts
export * from "./types.js";
export * from "./contrast.js";
export * from "./iv-roles-1.js";
export * from "./graph.js";
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test src/roles/graph.test.ts`
  Expected: PASS (9 passing tests across the four describe blocks: getRoleGraph ×2, isModePolarized ×2, classifySeedOrDerived ×4, repairTarget ×1).

- [ ] **Step 5: Commit** — `git add packages/theming/src/roles/graph.ts packages/theming/src/roles/index.ts packages/theming/src/roles/graph.test.ts && git commit -m "feat(theming): getRoleGraph + three-law helper predicates (mode-polarization, lock projection, repair direction)"`

---

### Task 6: `OklchColor` — parse-don't-validate color leaf

**Files:**
- Create: `packages/theming/src/spec/oklch.ts`
- Test: `packages/theming/src/spec/oklch.test.ts`

**Interfaces:**
- Consumes: culori (`converter`, `clampChroma`).
- Produces:
  ```ts
  export type Oklch = { l: number; c: number; h: number };
  export const CHROMA_CAP_DEFAULT = 0.4;
  // INPUT is a CSS color string, OUTPUT is the clamped Oklch — the three-arg ZodType<Output, Def, Input>
  // form is required so a `.transform()` (ZodEffects) is assignable (a bare ZodType<Oklch> would force
  // input=Oklch and reject the string-in transform).
  export const OklchColor: z.ZodType<Oklch, z.ZodTypeDef, string>;
  ```

- [ ] **Step 1: Write the failing test** — FULL vitest code:

```ts
// packages/theming/src/spec/oklch.test.ts
import { describe, it, expect } from "vitest";
import { OklchColor, CHROMA_CAP_DEFAULT } from "./oklch.js";

describe("OklchColor parse-don't-validate", () => {
  it("parses a hex color to the typed Oklch form (not a string)", () => {
    const r = OklchColor.safeParse("#ffffff");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(typeof r.data).toBe("object");
      expect(r.data.l).toBeGreaterThan(0.95);
      expect(r.data.c).toBeLessThan(0.01);
    }
  });

  it("parses an oklch() string", () => {
    const r = OklchColor.safeParse("oklch(0.6 0.15 250)");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.l).toBeCloseTo(0.6, 5);
      expect(r.data.h).toBeCloseTo(250, 3);
    }
  });

  it("clamps chroma to the cap on the way in", () => {
    // an absurdly high chroma must come back ≤ cap
    const r = OklchColor.safeParse("oklch(0.6 5 250)");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.c).toBeLessThanOrEqual(CHROMA_CAP_DEFAULT + 1e-9);
    }
  });

  it("rejects an unparseable color", () => {
    expect(OklchColor.safeParse("not-a-color").success).toBe(false);
  });

  it("rejects a smuggled CSS breakout string (parse failure, never advances)", () => {
    expect(OklchColor.safeParse("red; } body { display:none").success).toBe(false);
    expect(OklchColor.safeParse("var(--x)").success).toBe(false);
    expect(OklchColor.safeParse("url(https://evil)").success).toBe(false);
  });

  it("rejects a non-string input", () => {
    expect(OklchColor.safeParse(123).success).toBe(false);
    expect(OklchColor.safeParse({ l: 0.5, c: 0.1, h: 200 }).success).toBe(false);
  });

  it("achromatic hue collapses to 0 (NaN-safe)", () => {
    const r = OklchColor.safeParse("#808080");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(Number.isFinite(r.data.h)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test src/spec/oklch.test.ts`
  Expected failure: `Failed to resolve import "./oklch.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code:

```ts
// packages/theming/src/spec/oklch.ts
import { z } from "zod";
import { converter, clampChroma } from "culori";

// The parsed/typed OKLCH form that flows downstream. l ∈ [0,1], c ≥ 0 (clamped to cap), h ∈ [0,360).
export type Oklch = { l: number; c: number; h: number };

// v1 chroma cap. The manifest carries the authoritative per-app cap; this is the schema-level guard so
// no value parses past the wall over-saturated. Compiler/verifier re-check against manifest.chromaCap.
export const CHROMA_CAP_DEFAULT = 0.4;

const toOklch = converter("oklch");

// parse-don't-validate: accept a CSS color string, parse to OKLCH, clamp chroma on the way in.
// A breakout string fails culori's parser → undefined → zod rejection. The dangerous string never
// advances past the wall as a typed value. The ZodType<Output, Def, Input> three-arg annotation pins
// input=string / output=Oklch so the ZodEffects from .transform() is assignable to the exported type.
export const OklchColor: z.ZodType<Oklch, z.ZodTypeDef, string> = z
  .string()
  .transform((raw, ctx) => {
    let parsed;
    try {
      parsed = toOklch(raw);
    } catch {
      parsed = undefined;
    }
    if (!parsed) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unparseable color: ${raw}` });
      return z.NEVER;
    }
    // clampChroma keeps the color in-gamut, then re-run the oklch converter so we read channels off a
    // typed Oklch object — culori types clampChroma's return as the broad `Color` union (no l/c/h on every
    // member), which would not typecheck under strict; toOklch narrows it back to { mode, l, c, h? }.
    const clampedOklch = toOklch(clampChroma(parsed, "oklch"));
    if (!clampedOklch) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unparseable color: ${raw}` });
      return z.NEVER;
    }
    const l = clampedOklch.l ?? 0;
    // enforce the v1 cap on top of the gamut clamp.
    const c = Math.min(clampedOklch.c ?? 0, CHROMA_CAP_DEFAULT);
    const h = Number.isFinite(clampedOklch.h) ? (clampedOklch.h as number) : 0; // achromatic → 0 (NaN-safe)
    return { l, c, h } satisfies Oklch;
  });
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test src/spec/oklch.test.ts`
  Expected: PASS (7 passing tests).

- [ ] **Step 5: Commit** — `git add packages/theming/src/spec/oklch.ts packages/theming/src/spec/oklch.test.ts && git commit -m "feat(theming): OklchColor parse-don't-validate leaf (clamp chroma, reject CSS breakout)"`

---

### Task 7: The closed `StyleSpec` schema + `FontStackId` + `MAX_RADIUS_PX`

**Files:**
- Create: `packages/theming/src/spec/style-spec.ts`
- Test: `packages/theming/src/spec/style-spec.test.ts`

**Interfaces:**
- Consumes: `OklchColor`, `Oklch` from `./oklch.js`; `FontStackId` type from `../roles/types.js`.
- Produces:
  ```ts
  export const MAX_RADIUS_PX = 24;
  export const FontStackId: z.ZodType<FontStackId>; // a string leaf; semantic allowlist check happens in parseSpec
  export const StyleSpec: z.ZodType<…>; // closed, leaves .optional().nullable()
  export type StyleSpec = z.infer<typeof StyleSpec>;
  ```

- [ ] **Step 1: Write the failing test** — FULL vitest code:

```ts
// packages/theming/src/spec/style-spec.test.ts
import { describe, it, expect } from "vitest";
import { StyleSpec, MAX_RADIUS_PX } from "./style-spec.js";

describe("StyleSpec closed schema", () => {
  it("MAX_RADIUS_PX is 24", () => {
    expect(MAX_RADIUS_PX).toBe(24);
  });

  it("accepts a sparse delta touching one color", () => {
    const r = StyleSpec.safeParse({ colors: { primary: "#3366ff" } });
    expect(r.success).toBe(true);
    if (r.success) {
      // OklchColor parsed the string to a typed object
      expect(typeof (r.data.colors as Record<string, unknown>).primary).toBe("object");
    }
  });

  it("accepts the empty spec (app default)", () => {
    expect(StyleSpec.safeParse({}).success).toBe(true);
  });

  it("rejects an unknown top-level key (closed schema)", () => {
    expect(StyleSpec.safeParse({ surprise: 1 }).success).toBe(false);
  });

  it("rejects an unknown key inside colors (strict group)", () => {
    expect(StyleSpec.safeParse({ colors: { brand: "#fff" } }).success).toBe(false);
  });

  it("leaves are nullable (the removal sentinel) — null is legal at a leaf", () => {
    expect(StyleSpec.safeParse({ colors: { primary: null } }).success).toBe(true);
    expect(StyleSpec.safeParse({ radius: null }).success).toBe(true);
    expect(StyleSpec.safeParse({ typography: { body: null } }).success).toBe(true);
    expect(StyleSpec.safeParse({ mode: null }).success).toBe(true);
  });

  it("group objects are optional but NOT nullable", () => {
    expect(StyleSpec.safeParse({ colors: null }).success).toBe(false);
    expect(StyleSpec.safeParse({ typography: null }).success).toBe(false);
  });

  it("radius respects [0, MAX_RADIUS_PX]", () => {
    expect(StyleSpec.safeParse({ radius: 0 }).success).toBe(true);
    expect(StyleSpec.safeParse({ radius: MAX_RADIUS_PX }).success).toBe(true);
    expect(StyleSpec.safeParse({ radius: MAX_RADIUS_PX + 1 }).success).toBe(false);
    expect(StyleSpec.safeParse({ radius: -1 }).success).toBe(false);
  });

  it("density is the closed enum", () => {
    expect(StyleSpec.safeParse({ density: "compact" }).success).toBe(true);
    expect(StyleSpec.safeParse({ density: "cozy" }).success).toBe(false);
  });

  it("mode is the SpecMode enum (light/dark/both)", () => {
    for (const m of ["light", "dark", "both"]) {
      expect(StyleSpec.safeParse({ mode: m }).success).toBe(true);
    }
    expect(StyleSpec.safeParse({ mode: "system" }).success).toBe(false);
  });

  it("typography leaves are FontStackId strings (allowlist check is in parseSpec, not here)", () => {
    expect(StyleSpec.safeParse({ typography: { display: "serif-1" } }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test src/spec/style-spec.test.ts`
  Expected failure: `Failed to resolve import "./style-spec.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code:

```ts
// packages/theming/src/spec/style-spec.ts
import { z } from "zod";
import { OklchColor } from "./oklch.js";
import type { FontStackId as FontStackIdType } from "../roles/types.js";

// The schema's compile-time upper bound for the radius leaf. Plan 02 may tighten emitted radius via the
// profile but never relaxes this schema bound.
export const MAX_RADIUS_PX = 24;

// A font is an allowlist INDEX, never free text. This leaf only validates the string SHAPE; the
// semantic check (∈ manifest.allowedFonts) happens in parseSpec with manifest context.
export const FontStackId: z.ZodType<FontStackIdType> = z.string().min(1);

// THE WALL schema. Closed (.strict() — unknown keys rejected). Leaves .optional().nullable():
//   undefined = "not in this delta" (absent); null = removal sentinel ("revert to app default").
// The group objects are .optional() but NOT nullable (the sentinel is leaf-only).
export const StyleSpec = z
  .object({
    colors: z
      .object({
        primary: OklchColor.optional().nullable(),
        accent: OklchColor.optional().nullable(),
        neutral: OklchColor.optional().nullable(), // seeds the surface/line ramp; not an output var
        destructive: OklchColor.optional().nullable(),
      })
      .strict()
      .optional(),
    radius: z.number().min(0).max(MAX_RADIUS_PX).optional().nullable(),
    density: z.enum(["compact", "comfortable", "spacious"]).optional().nullable(),
    typography: z
      .object({
        display: FontStackId.optional().nullable(),
        body: FontStackId.optional().nullable(),
        mono: FontStackId.optional().nullable(),
      })
      .strict()
      .optional(),
    mode: z.enum(["light", "dark", "both"]).optional().nullable(),
  })
  .strict();

export type StyleSpec = z.infer<typeof StyleSpec>;
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test src/spec/style-spec.test.ts`
  Expected: PASS (11 passing tests).

- [ ] **Step 5: Commit** — `git add packages/theming/src/spec/style-spec.ts packages/theming/src/spec/style-spec.test.ts && git commit -m "feat(theming): closed StyleSpec schema (sparse, leaf-nullable sentinel, FontStackId, MAX_RADIUS_PX)"`

---

### Task 8: `Shape`/`Space`/`EmitContract` + `AppManifest` schema (field validators, no superRefine yet)

**Files:**
- Create: `packages/theming/src/manifest/schema.ts`
- Test: `packages/theming/src/manifest/schema.shape.test.ts`

**Interfaces:**
- Consumes: zod.
- Produces (verbatim from ledger §4.1, §4.2):
  ```ts
  export type Shape = "triple" | "function" | "raw" | "number";
  export type Space = "hsl" | "rgb" | "oklch" | null;
  export type EmitContract = { shape: Shape; space: Space; precision: number };
  export const AppManifest: z.ZodType<…>; // (superRefine added in Task 9)
  export type AppManifest = z.infer<typeof AppManifest>;
  ```

This task lands the object shape + field-level validators; Task 9 adds the named `superRefine` block on top of the same schema definition.

- [ ] **Step 1: Write the failing test** — FULL vitest code:

```ts
// packages/theming/src/manifest/schema.shape.test.ts
import { describe, it, expect } from "vitest";
import { AppManifest } from "./schema.js";

// A well-formed manifest skeleton. It is deliberately a FULLY AA-complete, superRefine-VALID manifest
// (not a minimal stub), because the shape test imports `AppManifest` from the SAME `./schema.js` that
// Task 9 augments with `.superRefine(...)`. A minimal `base.light` would pass the field validators in
// Task 8 but be rejected by `refBasePassesTier` once Task 9 lands, breaking the two "accepts …" shape
// tests below. Keeping the skeleton AA-complete makes both tasks deterministically green with no
// conditional fix-up. base.light below is the same 17-role AA block used by Task 9's valid() manifest.
// No typography role is mapped (only --primary), so allowedFonts may stay empty; locks are empty so
// refLocksResolveAndPinnable is trivially satisfied.
const skeleton = {
  appId: "acme",
  manifestVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  variables: {
    "--primary": { role: "primary", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
  },
  modes: { allowed: ["light"], default: "light", selectors: { light: ":root" } },
  base: {
    light: {
      background: "#ffffff",
      foreground: "#000000",
      card: "#ffffff",
      "card-fg": "#000000",
      popover: "#ffffff",
      "popover-fg": "#000000",
      primary: "#1a1a1a",
      "primary-fg": "#ffffff",
      secondary: "#f4f4f5",
      "secondary-fg": "#18181b",
      accent: "#1a1a1a",
      "accent-fg": "#ffffff",
      destructive: "#b91c1c",
      "destructive-fg": "#ffffff",
      muted: "#f1f1f1",
      "muted-fg": "#555555",
      ring: "#1a1a1a",
    },
  },
  defaultSeeds: {
    colors: { primary: "#1a1a1a", accent: "#1a1a1a", neutral: "#ffffff", destructive: "#b91c1c" },
    radius: 8,
    density: "comfortable",
  },
  invariants: {
    contrastTier: "AA",
    chromaCap: 0.3,
    locks: [],
    allowedFonts: [],
  },
};

describe("AppManifest field shape", () => {
  it("accepts a shape-valid skeleton (also superRefine-valid once Task 9 lands)", () => {
    // The skeleton is AA-complete + cross-field-consistent, so it passes field validators now AND
    // the superRefine layer added in Task 9 (this test must stay green across both tasks).
    const r = AppManifest.safeParse(skeleton);
    expect(r.success).toBe(true);
  });

  it("rejects a non-number manifestVersion", () => {
    expect(AppManifest.safeParse({ ...skeleton, manifestVersion: "1" }).success).toBe(false);
  });

  it("rejects an emit.shape outside the closed set", () => {
    const bad = structuredClone(skeleton);
    (bad.variables["--primary"].emit as { shape: string }).shape = "blob";
    expect(AppManifest.safeParse(bad).success).toBe(false);
  });

  it("accepts emit.space null (raw shape — consistent with the Task 9 emit-space refine)", () => {
    const raw = structuredClone(skeleton);
    // Cast: the skeleton's inferred emit.space type is `string`; null is assigned via a structural cast.
    // raw + null space is consistent with refEmitSpaceConsistent, so this stays green after Task 9.
    raw.variables["--primary"].emit = { shape: "raw", space: null, precision: 0 } as unknown as typeof raw.variables["--primary"]["emit"];
    expect(AppManifest.safeParse(raw).success).toBe(true);
  });

  it("rejects a contrastTier outside AA/AAA", () => {
    const bad = structuredClone(skeleton);
    (bad.invariants as { contrastTier: string }).contrastTier = "AAAA";
    expect(AppManifest.safeParse(bad).success).toBe(false);
  });

  it("rejects modes.allowed members outside light/dark", () => {
    const bad = structuredClone(skeleton);
    (bad.modes as { allowed: string[] }).allowed = ["sepia"];
    expect(AppManifest.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test src/manifest/schema.shape.test.ts`
  Expected failure: `Failed to resolve import "./schema.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code (the `superRefine` is added in Task 9 by editing this same file; for now the schema parses shape):

```ts
// packages/theming/src/manifest/schema.ts
import { z } from "zod";

// The format-contract emit struct (§5/§6). Space includes the literal null member.
export type Shape = "triple" | "function" | "raw" | "number";
export type Space = "hsl" | "rgb" | "oklch" | null;
export type EmitContract = { shape: Shape; space: Space; precision: number };

const ShapeSchema = z.enum(["triple", "function", "raw", "number"]);
const SpaceSchema = z.union([z.enum(["hsl", "rgb", "oklch"]), z.null()]);

export const AppManifest = z
  .object({
    appId: z.string(),
    manifestVersion: z.number(),
    vocabVersion: z.string(), // pins the role graph — "iv-roles-1"
    profileVersion: z.string(), // pins the ramp profile

    variables: z.record(
      z.string(), // VarName
      z.object({
        role: z.string(), // RoleId ∈ the pinned vocab's roles
        emit: z.object({ shape: ShapeSchema, space: SpaceSchema, precision: z.number() }),
        confidence: z.enum(["confirmed", "inferred"]),
      }),
    ),

    modes: z.object({
      allowed: z.array(z.enum(["light", "dark"])),
      default: z.enum(["light", "dark"]),
      selectors: z.object({ light: z.string(), dark: z.string().optional() }),
    }),

    base: z.object({
      light: z.record(z.string(), z.string()),
      dark: z.record(z.string(), z.string()).optional(),
    }),

    defaultSeeds: z.object({
      colors: z.object({
        primary: z.string(),
        accent: z.string(),
        neutral: z.string(),
        destructive: z.string(),
      }),
      radius: z.number(),
      density: z.enum(["compact", "comfortable", "spacious"]),
    }),

    invariants: z.object({
      contrastTier: z.enum(["AA", "AAA"]),
      chromaCap: z.number(),
      locks: z.array(z.string()), // (SeedId | RoleId)[]
      allowedFonts: z.array(z.object({ id: z.string(), stack: z.string() })),
    }),
  });
// NOTE: .superRefine(...) is added in Task 9 (cross-field integrity).

export type AppManifest = z.infer<typeof AppManifest>;
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test src/manifest/schema.shape.test.ts`
  Expected: PASS (6 passing tests).

- [ ] **Step 5: Commit** — `git add packages/theming/src/manifest/schema.ts packages/theming/src/manifest/schema.shape.test.ts && git commit -m "feat(theming): AppManifest schema field validators + Shape/Space/EmitContract"`

---

### Task 9: The full named `superRefine` layer (cross-field integrity + base-passes-tier gate)

**Files:**
- Modify: `packages/theming/src/manifest/schema.ts`
- Test: `packages/theming/src/manifest/schema.refine.test.ts`

**Interfaces:**
- Consumes: `getRoleGraph` from `../roles/graph.js`; `requiredContrast` from `../roles/contrast.js`; `classifySeedOrDerived` from `../roles/graph.js`; culori `wcagContrast`.
- Produces: the same `AppManifest` schema, now with the named checks `refRolesInVocab`, `refModesWellFormed`, `refDefaultSeedsComplete`, `refFontsPresentIfTypographyMapped`, `refEmitSpaceConsistent`, `refBasePassesTier`, `refLocksResolveAndPinnable`, `refPerModeSelectorPresent`.

- [ ] **Step 1: Write the failing test** — FULL vitest code:

```ts
// packages/theming/src/manifest/schema.refine.test.ts
import { describe, it, expect } from "vitest";
import { AppManifest } from "./schema.js";

// An AA-passing, fully consistent manifest. background=white, foreground=black ⇒ ratio 21 ≥ 4.5.
// muted=#f1f1f1, muted-fg=#555 ⇒ large-text floor 3.0. ring=#1a1a1a on white/card/popover ⇒ ui 3.0.
function valid() {
  return {
    appId: "acme",
    manifestVersion: 1,
    vocabVersion: "iv-roles-1",
    profileVersion: "iv-profile-1",
    variables: {
      "--background": { role: "background", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
      "--font-body": { role: "font-body", emit: { shape: "raw", space: null, precision: 0 }, confidence: "confirmed" },
    },
    modes: { allowed: ["light"], default: "light", selectors: { light: ":root" } },
    base: {
      light: {
        background: "#ffffff",
        foreground: "#000000",
        card: "#ffffff",
        "card-fg": "#000000",
        popover: "#ffffff",
        "popover-fg": "#000000",
        primary: "#1a1a1a",
        "primary-fg": "#ffffff",
        secondary: "#f4f4f5",
        "secondary-fg": "#18181b",
        accent: "#1a1a1a",
        "accent-fg": "#ffffff",
        destructive: "#b91c1c",
        "destructive-fg": "#ffffff",
        muted: "#f1f1f1",
        "muted-fg": "#555555",
        ring: "#1a1a1a",
      },
    },
    defaultSeeds: {
      colors: { primary: "#1a1a1a", accent: "#1a1a1a", neutral: "#ffffff", destructive: "#b91c1c" },
      radius: 8,
      density: "comfortable",
    },
    invariants: {
      contrastTier: "AA",
      chromaCap: 0.3,
      locks: ["primary"],
      allowedFonts: [{ id: "body-sans", stack: "ui-sans-serif, system-ui" }],
    },
  };
}

describe("AppManifest superRefine", () => {
  it("accepts a fully consistent AA-passing manifest", () => {
    const r = AppManifest.safeParse(valid());
    expect(r.success).toBe(true);
  });

  it("refRolesInVocab: variable role not in vocab rejected", () => {
    const m = valid();
    m.variables["--background"].role = "not-a-role";
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refRolesInVocab: lock not resolvable rejected", () => {
    const m = valid();
    m.invariants.locks = ["nonsense"];
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refModesWellFormed: default not in allowed rejected", () => {
    const m = valid();
    m.modes.default = "dark";
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refDefaultSeedsComplete: enforced by object schema (missing seed)", () => {
    const m = valid();
    delete (m.defaultSeeds.colors as Record<string, string>).accent;
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refFontsPresentIfTypographyMapped: typography role mapped but allowedFonts empty rejected", () => {
    const m = valid();
    m.variables["--font-body"].role = "font-body"; // already mapped
    m.invariants.allowedFonts = [];
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refEmitSpaceConsistent: triple with null space rejected", () => {
    const m = valid();
    m.variables["--background"].emit = { shape: "triple", space: null, precision: 3 };
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refEmitSpaceConsistent: raw with non-null space rejected", () => {
    const m = valid();
    m.variables["--font-body"].emit = { shape: "raw", space: "hsl", precision: 0 };
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refBasePassesTier: base failing AA text floor rejected (low-contrast foreground)", () => {
    const m = valid();
    m.base.light.foreground = "#cccccc"; // ~1.6:1 on white < 4.5
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refBasePassesTier: AAA tier on AA-only base rejected", () => {
    const m = valid();
    m.invariants.contrastTier = "AAA";
    m.base.light["muted-fg"] = "#777777"; // ~4.0 on #f1f1f1 < 4.5 AAA large-text
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refLocksResolveAndPinnable: derived-role lock with missing base entry rejected", () => {
    const m = valid();
    m.invariants.locks = ["card"]; // derived role
    delete (m.base.light as Record<string, string>).card; // dangling pin
    // also remove card-fg pair member so the only failure is the dangling lock pin, not a contrast miss
    // (card-fg/card still present; removing card makes the contrast check + lock pin both fail — either rejects)
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refPerModeSelectorPresent: allowed dark with no dark selector rejected", () => {
    const m = valid();
    m.modes.allowed = ["light", "dark"];
    // provide dark base so the only failure is the missing selector. valid()'s inferred type has no
    // base.dark, so widen base structurally to attach the optional dark map.
    (m.base as { light: Record<string, string>; dark?: Record<string, string> }).dark = { ...m.base.light };
    // no m.modes.selectors.dark
    expect(AppManifest.safeParse(m).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test src/manifest/schema.refine.test.ts`
  Expected failure: most rejection cases return `success: true` (no superRefine yet) — e.g. `refModesWellFormed: default not in allowed rejected` asserts `false` but gets `true`.

- [ ] **Step 3: Minimal implementation** — replace the schema's trailing definition by appending `.superRefine(...)`. Change the closing of the `z.object({...})` chain in `schema.ts` so the object is bound to a const and refined. FULL replacement code for the bottom of `schema.ts`:

  Replace:
  ```ts
    });
  // NOTE: .superRefine(...) is added in Task 9 (cross-field integrity).

  export type AppManifest = z.infer<typeof AppManifest>;
  ```
  with:
  ```ts
    })
    .superRefine((m, ctx) => {
      // Resolve the pinned graph once; an unknown vocab version is itself a hard failure.
      let graph;
      try {
        graph = getRoleGraph(m.vocabVersion);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vocabVersion"], message: `unknown vocab version: ${m.vocabVersion}` });
        return;
      }
      const roleSet = new Set(Object.keys(graph.roles));
      const seedSet = new Set(graph.seeds);

      // refRolesInVocab — variables[*].role and locks[*] ∈ the pinned vocab's role/seed set.
      for (const [varName, v] of Object.entries(m.variables)) {
        if (!roleSet.has(v.role)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variables", varName, "role"], message: `role not in vocab: ${v.role}` });
        }
      }
      for (let i = 0; i < m.invariants.locks.length; i++) {
        const lock = m.invariants.locks[i];
        if (!roleSet.has(lock) && !seedSet.has(lock)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["invariants", "locks", i], message: `lock does not resolve: ${lock}` });
        }
      }

      // refModesWellFormed — default ∈ allowed ⊆ {light,dark}.
      if (!m.modes.allowed.includes(m.modes.default)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["modes", "default"], message: `default mode not in allowed` });
      }

      // refDefaultSeedsComplete — the object schema already requires all four seed colors + radius +
      // density. The remaining "covers every seed" obligation (mode/typography picks have no value
      // payload in defaultSeeds by design) is satisfied structurally; nothing further to check here.

      // refFontsPresentIfTypographyMapped — allowedFonts non-empty if any typography role is mapped.
      const typographyRoles = new Set(["font-display", "font-body", "font-mono"]);
      const anyTypographyMapped = Object.values(m.variables).some((v) => typographyRoles.has(v.role));
      if (anyTypographyMapped && m.invariants.allowedFonts.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["invariants", "allowedFonts"], message: `typography role mapped but allowedFonts is empty` });
      }

      // refEmitSpaceConsistent — triple/function require non-null space; raw/number require null space.
      for (const [varName, v] of Object.entries(m.variables)) {
        const { shape, space } = v.emit;
        const needsSpace = shape === "triple" || shape === "function";
        if (needsSpace && space === null) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variables", varName, "emit", "space"], message: `${shape} requires a non-null space` });
        }
        if (!needsSpace && space !== null) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variables", varName, "emit", "space"], message: `${shape} requires a null space` });
        }
      }

      // refPerModeSelectorPresent — every allowed mode has its selector recorded.
      for (const mode of m.modes.allowed) {
        if (m.modes.selectors[mode] === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["modes", "selectors", mode], message: `allowed mode "${mode}" has no selector` });
        }
      }

      // refLocksResolveAndPinnable — seed locks need no base entry; derived-role locks need base[mode][role]
      // in every allowed mode.
      for (let i = 0; i < m.invariants.locks.length; i++) {
        const lock = m.invariants.locks[i];
        if (!roleSet.has(lock) && !seedSet.has(lock)) continue; // already flagged by refRolesInVocab
        if (classifySeedOrDerived(graph, lock) === "derived") {
          for (const mode of m.modes.allowed) {
            const baseForMode = mode === "dark" ? m.base.dark : m.base.light;
            if (!baseForMode || baseForMode[lock] === undefined) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["invariants", "locks", i], message: `derived-role lock "${lock}" has no base[${mode}] pin` });
            }
          }
        }
      }

      // refBasePassesTier — THE §3 gate, blocking. ∀ contrastPair, ∀ allowed mode:
      // ratio(base[mode][fg], base[mode][bg]) ≥ requiredContrast(tier, category).
      for (const mode of m.modes.allowed) {
        const baseForMode = mode === "dark" ? m.base.dark : m.base.light;
        if (!baseForMode) continue; // a missing dark base is surfaced elsewhere; skip the contrast pass
        for (const pair of graph.contrastPairs) {
          const fg = baseForMode[pair.fg];
          const bg = baseForMode[pair.bg];
          if (fg === undefined || bg === undefined) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["base", mode], message: `base[${mode}] missing ${fg === undefined ? pair.fg : pair.bg} for contrast pair` });
            continue;
          }
          const ratio = wcagContrast(fg, bg);
          const floor = requiredContrast(m.invariants.contrastTier, pair.category);
          if (!(ratio >= floor)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["base", mode, pair.fg],
              message: `base ${mode} (${pair.fg} on ${pair.bg}) contrast ${ratio.toFixed(2)} < required ${floor} for ${pair.category}`,
            });
          }
        }
      }
    });

  export type AppManifest = z.infer<typeof AppManifest>;
  ```

  And add these imports at the top of `schema.ts` (after the existing `import { z } from "zod";`):
  ```ts
  import { wcagContrast } from "culori";
  import { getRoleGraph, classifySeedOrDerived } from "../roles/graph.js";
  import { requiredContrast } from "../roles/contrast.js";
  ```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test src/manifest/schema.refine.test.ts && pnpm -F @invariance/theming test src/manifest/schema.shape.test.ts`
  Expected: PASS — 12 refine tests + 6 shape tests, all green. Re-running the Task 8 shape file is mandatory here: it imports `AppManifest` from the SAME `./schema.js` this task augmented with `.superRefine(...)`, so the superRefine now runs against the Task 8 skeleton. The skeleton was authored AA-complete and cross-field-consistent in Task 8 precisely so it stays green under the new refine layer (its two `accepts …` cases included). No skeleton edit is needed in this task.

- [ ] **Step 5: Commit** — `git add packages/theming/src/manifest/schema.ts packages/theming/src/manifest/schema.refine.test.ts packages/theming/src/manifest/schema.shape.test.ts && git commit -m "feat(theming): full named superRefine (roles/locks/modes/fonts/emit-space + blocking base-passes-tier gate)"`

---

### Task 10: `SHADCN_CAN` — the AA-passing shadcn "can" manifest fixture

**Files:**
- Create: `packages/theming/src/manifest/shadcn-can.ts`
- Create: `packages/theming/src/manifest/index.ts`
- Test: `packages/theming/src/manifest/shadcn-can.test.ts`

**Interfaces:**
- Consumes: `AppManifest` from `./schema.js`.
- Produces:
  ```ts
  export const SHADCN_CAN: AppManifest; // a prebuilt, AA-passing, color-mix-free manifest
  ```
- `manifest/index.ts` re-exports schema + shadcn-can.

- [ ] **Step 1: Write the failing test** — FULL vitest code:

```ts
// packages/theming/src/manifest/shadcn-can.test.ts
import { describe, it, expect } from "vitest";
import { AppManifest } from "./schema.js";
import { SHADCN_CAN } from "./shadcn-can.js";

describe("SHADCN_CAN fixture", () => {
  it("passes the full AppManifest schema (incl. base-passes-tier AA gate)", () => {
    const r = AppManifest.safeParse(SHADCN_CAN);
    if (!r.success) {
      // surface the first failure to make a broken fixture diagnosable
      throw new Error(JSON.stringify(r.error.issues[0]));
    }
    expect(r.success).toBe(true);
  });

  it("is an iv-roles-1 / AA manifest", () => {
    expect(SHADCN_CAN.vocabVersion).toBe("iv-roles-1");
    expect(SHADCN_CAN.invariants.contrastTier).toBe("AA");
  });

  it("uses no color-mix (every emit space is a concrete channel space or null)", () => {
    for (const v of Object.values(SHADCN_CAN.variables)) {
      expect(["hsl", "rgb", "oklch", null]).toContain(v.emit.space);
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test src/manifest/shadcn-can.test.ts`
  Expected failure: `Failed to resolve import "./shadcn-can.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code (a real AA-passing base; light-only for v1; `primary` locked):

```ts
// packages/theming/src/manifest/shadcn-can.ts
import type { AppManifest } from "./schema.js";

// The prebuilt manifest for the near-zero-touch shadcn path (§1.1, §5). Light-only for v1.
// base meets AA (so refBasePassesTier passes) and uses NO color-mix. The 17 contrast-relevant roles
// are pinned; emit is hsl-triple per shadcn's hsl(var(--x)) consumption convention. Fonts are raw.
export const SHADCN_CAN: AppManifest = {
  appId: "shadcn-can",
  manifestVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  variables: {
    "--background": { role: "background", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--foreground": { role: "foreground", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--card": { role: "card", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--card-foreground": { role: "card-fg", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--popover": { role: "popover", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--popover-foreground": { role: "popover-fg", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--primary": { role: "primary", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--primary-foreground": { role: "primary-fg", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--secondary": { role: "secondary", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--secondary-foreground": { role: "secondary-fg", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--accent": { role: "accent", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--accent-foreground": { role: "accent-fg", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--destructive": { role: "destructive", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--destructive-foreground": { role: "destructive-fg", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--muted": { role: "muted", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--muted-foreground": { role: "muted-fg", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--border": { role: "border", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--input": { role: "input", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--ring": { role: "ring", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--radius": { role: "radius", emit: { shape: "number", space: null, precision: 3 }, confidence: "confirmed" },
    "--font-sans": { role: "font-body", emit: { shape: "raw", space: null, precision: 0 }, confidence: "confirmed" },
  },
  modes: {
    allowed: ["light"],
    default: "light",
    selectors: { light: ":root", dark: ".dark" },
  },
  base: {
    light: {
      background: "#ffffff",
      foreground: "#0a0a0a",
      card: "#ffffff",
      "card-fg": "#0a0a0a",
      popover: "#ffffff",
      "popover-fg": "#0a0a0a",
      primary: "#18181b",
      "primary-fg": "#fafafa",
      secondary: "#f4f4f5",
      "secondary-fg": "#18181b",
      accent: "#f4f4f5",
      "accent-fg": "#18181b",
      destructive: "#dc2626",
      "destructive-fg": "#fafafa",
      muted: "#f4f4f5",
      "muted-fg": "#52525b",
      border: "#e4e4e7",
      input: "#e4e4e7",
      ring: "#18181b",
    },
  },
  defaultSeeds: {
    colors: { primary: "#18181b", accent: "#f4f4f5", neutral: "#ffffff", destructive: "#dc2626" },
    radius: 8,
    density: "comfortable",
  },
  invariants: {
    contrastTier: "AA",
    chromaCap: 0.3,
    locks: ["primary"],
    allowedFonts: [{ id: "sans", stack: "ui-sans-serif, system-ui, sans-serif" }],
  },
};
```

```ts
// packages/theming/src/manifest/index.ts
export * from "./schema.js";
export * from "./shadcn-can.js";
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test src/manifest/shadcn-can.test.ts`
  Expected: PASS (3 passing tests). The base block above is AA-complete by construction — all 11 contrast
  pairs clear AA (the tightest is `(destructive-fg=#fafafa, destructive=#dc2626)` ≈ 4.6 ≥ 4.5; the rest
  range 7–20), so `refBasePassesTier` passes deterministically. Do NOT hand-tune values; if a future edit
  to the base drops a pair below 4.5, the gate fails loudly and the fixture (not the gate) is wrong.

- [ ] **Step 5: Commit** — `git add packages/theming/src/manifest/shadcn-can.ts packages/theming/src/manifest/index.ts packages/theming/src/manifest/shadcn-can.test.ts && git commit -m "feat(theming): SHADCN_CAN AA-passing color-mix-free manifest fixture"`

---

### Task 11: `parseSpec` — the wall (with seed-lock projection + font-allowlist check)

**Files:**
- Create: `packages/theming/src/spec/parse-spec.ts`
- Create: `packages/theming/src/spec/index.ts`
- Test: `packages/theming/src/spec/parse-spec.test.ts`

**Interfaces:**
- Consumes: `StyleSpec` from `./style-spec.js`; `AppManifest` from `../manifest/schema.js`; `getRoleGraph`, `classifySeedOrDerived` from `../roles/graph.js`.
- Produces (verbatim from ledger §3.5):
  ```ts
  export function parseSpec(json: unknown, manifest: AppManifest): ParseResult;
  export type ParseResult = { ok: true; spec: StyleSpec } | { ok: false; failures: WallFailure[] };
  export type WallFailure = { code: WallFailureCode; path: string; message: string };
  export type WallFailureCode =
    | "unknown_key" | "unparseable_color" | "font_not_allowed"
    | "seed_locked" | "out_of_range" | "schema_invalid";
  ```
- `spec/index.ts` re-exports oklch + style-spec + parse-spec.

- [ ] **Step 1: Write the failing test** — FULL vitest code:

```ts
// packages/theming/src/spec/parse-spec.test.ts
import { describe, it, expect } from "vitest";
import { parseSpec } from "./parse-spec.js";
import { SHADCN_CAN } from "../manifest/index.js";

// SHADCN_CAN locks ["primary"] (a seed lock) and allows font id "sans".
describe("parseSpec — the wall", () => {
  it("accepts a valid sparse delta and returns the typed spec", () => {
    const r = parseSpec({ colors: { accent: "#3366ff" } }, SHADCN_CAN);
    expect(r.ok).toBe(true);
    if (r.ok) expect(typeof (r.spec.colors as Record<string, unknown>).accent).toBe("object");
  });

  it("rejects an unknown key (closed-schema → unknown_key/schema_invalid)", () => {
    const r = parseSpec({ surprise: 1 }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["unknown_key", "schema_invalid"]).toContain(r.failures[0].code);
  });

  it("rejects an unparseable color with unparseable_color", () => {
    const r = parseSpec({ colors: { accent: "not-a-color" } }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failures.some((f) => f.code === "unparseable_color")).toBe(true);
      expect(r.failures.some((f) => f.path === "colors.accent")).toBe(true);
    }
  });

  it("rejects a CSS-breakout color (parse failure → unparseable_color)", () => {
    const r = parseSpec({ colors: { accent: "red; } body { x:1" } }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.some((f) => f.code === "unparseable_color")).toBe(true);
  });

  it("rejects an out-of-range radius with out_of_range", () => {
    const r = parseSpec({ radius: 999 }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.some((f) => f.code === "out_of_range")).toBe(true);
  });

  it("seed-lock projection: setting locked primary is rejected with seed_locked", () => {
    const r = parseSpec({ colors: { primary: "#3366ff" } }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failures.some((f) => f.code === "seed_locked")).toBe(true);
      expect(r.failures.some((f) => f.path === "colors.primary")).toBe(true);
    }
  });

  it("seed-lock projection: setting locked primary to the null sentinel is also rejected", () => {
    const r = parseSpec({ colors: { primary: null } }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.some((f) => f.code === "seed_locked")).toBe(true);
  });

  it("seed-only neutral lock rejects setting neutral", () => {
    const m = structuredClone(SHADCN_CAN);
    m.invariants.locks = ["neutral"];
    const r = parseSpec({ colors: { neutral: "#222222" } }, m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failures.some((f) => f.code === "seed_locked")).toBe(true);
  });

  it("derived-role lock is NOT rejected at the wall (compiler pins it later)", () => {
    const m = structuredClone(SHADCN_CAN);
    m.invariants.locks = ["card"]; // derived role; base.light.card exists in SHADCN_CAN
    // setting primary is now legal (not locked), and it transitively feeds nothing of card here
    const r = parseSpec({ colors: { accent: "#3366ff" } }, m);
    expect(r.ok).toBe(true);
  });

  it("font allowlist: an unknown font id is rejected with font_not_allowed", () => {
    const r = parseSpec({ typography: { body: "comic-sans-99" } }, SHADCN_CAN);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failures.some((f) => f.code === "font_not_allowed")).toBe(true);
      expect(r.failures.some((f) => f.path === "typography.body")).toBe(true);
    }
  });

  it("font allowlist: an allowed font id passes", () => {
    const r = parseSpec({ typography: { body: "sans" } }, SHADCN_CAN);
    expect(r.ok).toBe(true);
  });

  it("font null sentinel is always allowed (a removal, not a font choice)", () => {
    const r = parseSpec({ typography: { body: null } }, SHADCN_CAN);
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test src/spec/parse-spec.test.ts`
  Expected failure: `Failed to resolve import "./parse-spec.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code (two files):

```ts
// packages/theming/src/spec/parse-spec.ts
import { z } from "zod";
import { StyleSpec } from "./style-spec.js";
import type { AppManifest } from "../manifest/schema.js";
import { getRoleGraph, classifySeedOrDerived } from "../roles/graph.js";

export type WallFailureCode =
  | "unknown_key" // closed-schema violation
  | "unparseable_color" // OklchColor failed to parse (incl. CSS breakout attempt)
  | "font_not_allowed" // FontStackId ∉ manifest.allowedFonts
  | "seed_locked" // delta sets a seed that is locked (lock projection at the wall)
  | "out_of_range" // radius/enum out of bounds
  | "schema_invalid"; // any other zod failure

export type WallFailure = {
  code: WallFailureCode;
  path: string; // dotted path to the offending field, e.g. "colors.primary"
  message: string;
};

export type ParseResult = { ok: true; spec: StyleSpec } | { ok: false; failures: WallFailure[] };

// Map a zod issue to a WallFailureCode + dotted path.
function classifyZodIssue(issue: z.ZodIssue): WallFailure {
  const path = issue.path.join(".");
  let code: WallFailureCode;
  if (issue.code === z.ZodIssueCode.unrecognized_keys) {
    code = "unknown_key";
  } else if (issue.code === z.ZodIssueCode.too_big || issue.code === z.ZodIssueCode.too_small) {
    code = "out_of_range";
  } else if (issue.code === z.ZodIssueCode.invalid_enum_value) {
    code = "out_of_range";
  } else if (issue.code === z.ZodIssueCode.custom && /unparseable color/i.test(issue.message)) {
    code = "unparseable_color";
  } else {
    code = "schema_invalid";
  }
  // an unrecognized_keys issue reports the offending keys, not a leaf path
  const keyPath =
    issue.code === z.ZodIssueCode.unrecognized_keys && issue.keys.length > 0
      ? [path, issue.keys[0]].filter(Boolean).join(".")
      : path;
  return { code, path: keyPath, message: issue.message };
}

// THE WALL. Parse-don't-validate against the closed schema, WITH manifest context for the two
// manifest-dependent checks: seed-lock projection and font allowlist membership.
export function parseSpec(json: unknown, manifest: AppManifest): ParseResult {
  // 1) Schema parse (closed schema, OklchColor parse-don't-validate happens inside).
  const parsed = StyleSpec.safeParse(json);
  if (!parsed.success) {
    return { ok: false, failures: parsed.error.issues.map(classifyZodIssue) };
  }
  const spec = parsed.data;
  const failures: WallFailure[] = [];

  // 2) Seed-lock projection. A seed lock (incl. seed-only neutral) rejects a delta that SETS that seed,
  //    even to the null sentinel. A derived-role lock is NOT rejected here (compiler pins it).
  const graph = getRoleGraph(manifest.vocabVersion);
  const seedLocks = new Set(
    manifest.invariants.locks.filter((lock) => classifySeedOrDerived(graph, lock) === "seed"),
  );
  if (spec.colors) {
    // colors.* keys map 1:1 to seed ids (primary/accent/neutral/destructive)
    for (const seedKey of Object.keys(spec.colors) as Array<keyof typeof spec.colors>) {
      // presence of the key (even null) is "setting that seed"
      if (seedLocks.has(seedKey)) {
        failures.push({ code: "seed_locked", path: `colors.${seedKey}`, message: `seed "${seedKey}" is locked` });
      }
    }
  }
  // radius/density/mode are seed axes too; a lock on them rejects setting them.
  for (const axis of ["radius", "density", "mode"] as const) {
    if (spec[axis] !== undefined && seedLocks.has(axis)) {
      failures.push({ code: "seed_locked", path: axis, message: `seed "${axis}" is locked` });
    }
  }

  // 3) Font allowlist membership (a non-null typography leaf must be an allowed font id).
  const allowedFontIds = new Set(manifest.invariants.allowedFonts.map((f) => f.id));
  if (spec.typography) {
    for (const slot of ["display", "body", "mono"] as const) {
      const id = spec.typography[slot];
      if (id !== undefined && id !== null && !allowedFontIds.has(id)) {
        failures.push({ code: "font_not_allowed", path: `typography.${slot}`, message: `font "${id}" is not in the allowlist` });
      }
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, spec };
}
```

```ts
// packages/theming/src/spec/index.ts
export * from "./oklch.js";
export * from "./style-spec.js";
export * from "./parse-spec.js";
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test src/spec/parse-spec.test.ts`
  Expected: PASS (12 passing tests).

- [ ] **Step 5: Commit** — `git add packages/theming/src/spec/parse-spec.ts packages/theming/src/spec/index.ts packages/theming/src/spec/parse-spec.test.ts && git commit -m "feat(theming): parseSpec wall (seed-lock projection + font allowlist, typed WallFailure codes)"`

---

### Task 12: `mergeDelta` + `canonicalize` (structural, sentinel-normalizing, total)

**Files:**
- Create: `packages/theming/src/session/merge.ts`
- Test: `packages/theming/src/session/merge.test.ts`

**Interfaces:**
- Consumes: `StyleSpec` from `../spec/style-spec.js`.
- Produces (verbatim from ledger §3.6):
  ```ts
  export function mergeDelta(draft: StyleSpec, delta: StyleSpec): StyleSpec;
  export function canonicalize(spec: StyleSpec): StyleSpec;
  ```

- [ ] **Step 1: Write the failing test** — FULL vitest code (operates on typed/parsed specs; uses raw objects shaped like parsed specs so we don't depend on OklchColor here):

```ts
// packages/theming/src/session/merge.test.ts
import { describe, it, expect } from "vitest";
import { mergeDelta, canonicalize } from "./merge.js";
import type { StyleSpec } from "../spec/style-spec.js";

// Typed Oklch leaves (post-wall shape). We build StyleSpecs directly to keep this unit pure.
const ok = (l: number, c: number, h: number) => ({ l, c, h });

describe("canonicalize", () => {
  it("drops an empty colors group", () => {
    const out = canonicalize({ colors: {} } as unknown as StyleSpec);
    expect(out).toEqual({});
  });
  it("drops an empty typography group", () => {
    const out = canonicalize({ typography: {} } as unknown as StyleSpec);
    expect(out).toEqual({});
  });
  it("keeps non-empty groups and scalars", () => {
    const spec = { colors: { primary: ok(0.3, 0.1, 250) }, radius: 8 } as unknown as StyleSpec;
    expect(canonicalize(spec)).toEqual(spec);
  });
  it("the empty spec canonicalizes to itself (single representation of app default)", () => {
    expect(canonicalize({} as StyleSpec)).toEqual({});
  });
});

describe("mergeDelta", () => {
  it("structural: a colors delta keeps untouched siblings", () => {
    const draft = { colors: { primary: ok(0.3, 0.1, 250), neutral: ok(1, 0, 0) } } as unknown as StyleSpec;
    const delta = { colors: { accent: ok(0.6, 0.2, 30) } } as unknown as StyleSpec;
    const out = mergeDelta(draft, delta);
    expect(out).toEqual({
      colors: { primary: ok(0.3, 0.1, 250), neutral: ok(1, 0, 0), accent: ok(0.6, 0.2, 30) },
    });
  });

  it("sentinel: null at a color leaf deletes that key; draft stays null-free", () => {
    const draft = { colors: { primary: ok(0.3, 0.1, 250), accent: ok(0.6, 0.2, 30) } } as unknown as StyleSpec;
    const delta = { colors: { accent: null } } as unknown as StyleSpec;
    const out = mergeDelta(draft, delta);
    expect(out).toEqual({ colors: { primary: ok(0.3, 0.1, 250) } });
  });

  it("sentinel: deleting the last color leaf drops the whole colors group (canonical)", () => {
    const draft = { colors: { primary: ok(0.3, 0.1, 250) } } as unknown as StyleSpec;
    const delta = { colors: { primary: null } } as unknown as StyleSpec;
    expect(mergeDelta(draft, delta)).toEqual({});
  });

  it("scalar: a radius delta shallow-sets; null deletes it", () => {
    expect(mergeDelta({ radius: 8 } as StyleSpec, { radius: 12 } as StyleSpec)).toEqual({ radius: 12 });
    expect(mergeDelta({ radius: 8 } as StyleSpec, { radius: null } as unknown as StyleSpec)).toEqual({});
  });

  it("typography recurses one level like colors", () => {
    const draft = { typography: { body: "a", mono: "b" } } as unknown as StyleSpec;
    const delta = { typography: { mono: null, display: "c" } } as unknown as StyleSpec;
    expect(mergeDelta(draft, delta)).toEqual({ typography: { body: "a", display: "c" } });
  });

  it("does not mutate its inputs (pure)", () => {
    const draft = { colors: { primary: ok(0.3, 0.1, 250) } } as unknown as StyleSpec;
    const delta = { colors: { accent: ok(0.6, 0.2, 30) } } as unknown as StyleSpec;
    const draftCopy = structuredClone(draft);
    mergeDelta(draft, delta);
    expect(draft).toEqual(draftCopy);
  });

  it("merge result is always null-free", () => {
    const out = mergeDelta(
      { colors: { primary: ok(0.3, 0.1, 250) } } as unknown as StyleSpec,
      { colors: { primary: null }, radius: null, mode: null } as unknown as StyleSpec,
    );
    expect(JSON.stringify(out)).not.toContain("null");
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test src/session/merge.test.ts`
  Expected failure: `Failed to resolve import "./merge.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code:

```ts
// packages/theming/src/session/merge.ts
import type { StyleSpec } from "../spec/style-spec.js";

type Group = "colors" | "typography";
const GROUPS: Group[] = ["colors", "typography"];
const SCALARS = ["radius", "density", "mode"] as const;

// Total canonicalization: drop empty groups so a draft has EXACTLY ONE representation.
// Run after every merge → "draft == appDefault?" becomes structural equality ({}).
export function canonicalize(spec: StyleSpec): StyleSpec {
  const out: Record<string, unknown> = {};
  for (const g of GROUPS) {
    const group = (spec as Record<string, unknown>)[g] as Record<string, unknown> | undefined;
    if (group && Object.keys(group).length > 0) {
      out[g] = { ...group };
    }
  }
  for (const s of SCALARS) {
    const v = (spec as Record<string, unknown>)[s];
    if (v !== undefined) {
      out[s] = v;
    }
  }
  return out as StyleSpec;
}

// Fold a parsed sparse delta onto the draft. Structural (recurses one level into colors/typography),
// applies the null sentinel as delete, shallow-sets scalars, then canonicalizes. Output is null-free.
// Pure — never mutates its inputs.
export function mergeDelta(draft: StyleSpec, delta: StyleSpec): StyleSpec {
  const next: Record<string, unknown> = {};

  // Carry forward existing groups (cloned).
  for (const g of GROUPS) {
    const cur = (draft as Record<string, unknown>)[g] as Record<string, unknown> | undefined;
    if (cur) next[g] = { ...cur };
  }
  for (const s of SCALARS) {
    const cur = (draft as Record<string, unknown>)[s];
    if (cur !== undefined) next[s] = cur;
  }

  // Apply group deltas (set non-null leaves; delete on null sentinel).
  for (const g of GROUPS) {
    const groupDelta = (delta as Record<string, unknown>)[g] as Record<string, unknown> | undefined;
    if (groupDelta === undefined) continue;
    const target = (next[g] as Record<string, unknown> | undefined) ?? {};
    const merged = { ...target };
    for (const [leaf, value] of Object.entries(groupDelta)) {
      if (value === null) {
        delete merged[leaf];
      } else {
        merged[leaf] = value;
      }
    }
    next[g] = merged;
  }

  // Apply scalar deltas (set; delete on null sentinel).
  for (const s of SCALARS) {
    const v = (delta as Record<string, unknown>)[s];
    if (v === undefined) continue;
    if (v === null) {
      delete next[s];
    } else {
      next[s] = v;
    }
  }

  return canonicalize(next as StyleSpec);
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test src/session/merge.test.ts`
  Expected: PASS (11 passing tests).

- [ ] **Step 5: Commit** — `git add packages/theming/src/session/merge.ts packages/theming/src/session/merge.test.ts && git commit -m "feat(theming): mergeDelta + canonicalize (structural, sentinel-normalizing, total — draft stays null-free)"`

---

### Task 13: `diffSpecs` — three-state diff over the closed role set

**Files:**
- Create: `packages/theming/src/session/diff.ts`
- Create: `packages/theming/src/session/index.ts`
- Test: `packages/theming/src/session/diff.test.ts`

**Interfaces:**
- Consumes: `StyleSpec` from `../spec/style-spec.js`; `AppManifest` from `../manifest/schema.js`; `RoleId`, `SeedId` from `../roles/types.js`.
- Produces (verbatim from ledger §3.6):
  ```ts
  export function diffSpecs(prev: StyleSpec, next: StyleSpec, manifest: AppManifest): FieldDiff[];
  export type FieldDiff = {
    role: RoleId | SeedId;
    from: string | null;
    to: string | null;
    kind: "added" | "changed" | "removed";
  };
  ```
  > Resolution rule for v1 (in-this-plan, no compiler yet): a present seed/scalar leaf resolves to a stable string form (color → `oklch(l c h)` at fixed precision; radius/density/mode → their literal). An absent field resolves to the manifest's app-default (`defaultSeeds`) value, also rendered to the same stable string. This gives `from`/`to` as RESOLVED values without importing the compiler.
- `session/index.ts` re-exports merge + diff.

- [ ] **Step 1: Write the failing test** — FULL vitest code:

```ts
// packages/theming/src/session/diff.test.ts
import { describe, it, expect } from "vitest";
import { diffSpecs } from "./diff.js";
import { SHADCN_CAN } from "../manifest/index.js";
import type { StyleSpec } from "../spec/style-spec.js";

const ok = (l: number, c: number, h: number) => ({ l, c, h });

describe("diffSpecs (three-state, resolved values)", () => {
  it("identical drafts emit nothing (empty-diff signal)", () => {
    const d = { colors: { primary: ok(0.3, 0.1, 250) } } as unknown as StyleSpec;
    expect(diffSpecs(d, structuredClone(d) as StyleSpec, SHADCN_CAN)).toEqual([]);
  });

  it("the empty spec vs itself is the canonical no-op", () => {
    expect(diffSpecs({} as StyleSpec, {} as StyleSpec, SHADCN_CAN)).toEqual([]);
  });

  it("adding a field that was absent ⇒ kind added, from null", () => {
    const out = diffSpecs({} as StyleSpec, { radius: 12 } as StyleSpec, SHADCN_CAN);
    const r = out.find((d) => d.role === "radius");
    expect(r).toBeDefined();
    expect(r!.kind).toBe("added");
    expect(r!.from).toBeNull();
    expect(r!.to).toBe("12");
  });

  it("changing a present field ⇒ kind changed, both values resolved", () => {
    const out = diffSpecs({ radius: 8 } as StyleSpec, { radius: 12 } as StyleSpec, SHADCN_CAN);
    const r = out.find((d) => d.role === "radius")!;
    expect(r.kind).toBe("changed");
    expect(r.from).toBe("8");
    expect(r.to).toBe("12");
  });

  it("removing a field ⇒ kind removed, to = app-default resolved value", () => {
    // SHADCN_CAN defaultSeeds.radius = 8; removing a set radius reverts to 8
    const out = diffSpecs({ radius: 12 } as StyleSpec, {} as StyleSpec, SHADCN_CAN);
    const r = out.find((d) => d.role === "radius")!;
    expect(r.kind).toBe("removed");
    expect(r.from).toBe("12");
    expect(r.to).toBe("8"); // app default
  });

  it("a field set to its current value across both specs emits nothing", () => {
    const out = diffSpecs({ density: "compact" } as StyleSpec, { density: "compact" } as StyleSpec, SHADCN_CAN);
    expect(out.find((d) => d.role === "density")).toBeUndefined();
  });

  it("color change resolves to a stable oklch() string for both sides", () => {
    const out = diffSpecs(
      { colors: { accent: ok(0.6, 0.2, 30) } } as unknown as StyleSpec,
      { colors: { accent: ok(0.7, 0.15, 200) } } as unknown as StyleSpec,
      SHADCN_CAN,
    );
    const a = out.find((d) => d.role === "accent")!;
    expect(a.kind).toBe("changed");
    expect(a.from).toMatch(/^oklch\(/);
    expect(a.to).toMatch(/^oklch\(/);
  });

  it("color removal resolves `to` (app default) as an oklch() string, not a raw hex", () => {
    // SHADCN_CAN.defaultSeeds.colors.accent = "#f4f4f5"; removing a set accent reverts to its oklch().
    const out = diffSpecs(
      { colors: { accent: ok(0.6, 0.2, 30) } } as unknown as StyleSpec,
      {} as StyleSpec,
      SHADCN_CAN,
    );
    const a = out.find((d) => d.role === "accent")!;
    expect(a.kind).toBe("removed");
    expect(a.from).toMatch(/^oklch\(/);
    expect(a.to).toMatch(/^oklch\(/); // resolved app default, same string form as a present value
    expect(a.to).not.toMatch(/^#/); // never a raw hex
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test src/session/diff.test.ts`
  Expected failure: `Failed to resolve import "./diff.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code (two files):

```ts
// packages/theming/src/session/diff.ts
import type { StyleSpec } from "../spec/style-spec.js";
import type { AppManifest } from "../manifest/schema.js";
import type { RoleId, SeedId } from "../roles/types.js";
import { OklchColor, type Oklch } from "../spec/oklch.js";

export type FieldDiff = {
  role: RoleId | SeedId;
  from: string | null; // resolved prior value (null when kind === "added")
  to: string | null; // resolved next value (null when kind === "removed")
  kind: "added" | "changed" | "removed";
};

type Leaf = Oklch | number | string | undefined;

// Stable string resolution. Color → fixed-precision oklch(); scalar → its literal. Absent → undefined.
function resolveColor(v: Oklch): string {
  return `oklch(${v.l.toFixed(4)} ${v.c.toFixed(4)} ${v.h.toFixed(2)})`;
}

function render(v: Leaf): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "object") return resolveColor(v);
  return String(v);
}

// The four color seeds in colors{} map 1:1 to seed/role ids.
const COLOR_SEEDS = ["primary", "accent", "neutral", "destructive"] as const;
const SCALARS = ["radius", "density"] as const; // mode is not a default-seeded color field; see note
const TYPO = ["display", "body", "mono"] as const;

// App-default value for a field, from defaultSeeds, rendered to the SAME stable string form as a present
// value so "removed" diffs show resolved values, not a raw hex (spec §4.3: "the user sees truth").
// A color seed's defaultSeeds hex is parsed through OklchColor and rendered as oklch(); scalars are their
// literal. If a default hex somehow fails to parse, fall back to the raw hex rather than dropping the diff.
function appDefault(field: string, manifest: AppManifest): string | undefined {
  if ((COLOR_SEEDS as readonly string[]).includes(field)) {
    const hex = manifest.defaultSeeds.colors[field as (typeof COLOR_SEEDS)[number]];
    const parsed = OklchColor.safeParse(hex);
    return parsed.success ? resolveColor(parsed.data) : hex;
  }
  if (field === "radius") return String(manifest.defaultSeeds.radius);
  if (field === "density") return manifest.defaultSeeds.density;
  return undefined; // typography/mode have no defaultSeeds value
}

function readField(spec: StyleSpec, field: string): Leaf {
  if ((COLOR_SEEDS as readonly string[]).includes(field)) {
    return spec.colors?.[field as (typeof COLOR_SEEDS)[number]] ?? undefined;
  }
  if ((TYPO as readonly string[]).includes(field)) {
    return spec.typography?.[field as (typeof TYPO)[number]] ?? undefined;
  }
  return (spec as Record<string, unknown>)[field] as Leaf;
}

// All fields the diff walks (the closed input set).
const FIELDS = [...COLOR_SEEDS, ...SCALARS, "mode", ...TYPO] as const;

// Three-state diff over the closed role set. Both operands are full, parsed, post-merge drafts.
// Resolved "from"/"to" via the manifest defaults; no-op fields emit nothing.
export function diffSpecs(prev: StyleSpec, next: StyleSpec, manifest: AppManifest): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const field of FIELDS) {
    const prevRaw = readField(prev, field);
    const nextRaw = readField(next, field);
    const prevStr = render(prevRaw);
    const nextStr = render(nextRaw);

    const inPrev = prevStr !== undefined;
    const inNext = nextStr !== undefined;

    if (!inPrev && !inNext) continue; // untouched in both → nothing

    if (inPrev && inNext) {
      if (prevStr === nextStr) continue; // no-op
      out.push({ role: field, from: prevStr, to: nextStr, kind: "changed" });
    } else if (!inPrev && inNext) {
      out.push({ role: field, from: null, to: nextStr!, kind: "added" });
    } else {
      // removed: to = app-default resolved value (the sentinel-revert surface)
      out.push({ role: field, from: prevStr!, to: appDefault(field, manifest) ?? null, kind: "removed" });
    }
  }
  return out;
}
```

```ts
// packages/theming/src/session/index.ts
export * from "./merge.js";
export * from "./diff.js";
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test src/session/diff.test.ts`
  Expected: PASS (8 passing tests).

- [ ] **Step 5: Commit** — `git add packages/theming/src/session/diff.ts packages/theming/src/session/index.ts packages/theming/src/session/diff.test.ts && git commit -m "feat(theming): diffSpecs three-state diff (resolved values, empty-diff signal, sentinel-revert to app default)"`

---

### Task 14: Top-level barrel + full-suite green

**Files:**
- Modify: `packages/theming/src/index.ts`
- Test: `packages/theming/src/barrel.test.ts`

**Interfaces:**
- Consumes: all four module barrels (`./roles/index.js`, `./spec/index.js`, `./manifest/index.js`, `./session/index.js`).
- Produces: `@invariance/theming` top-level barrel re-exporting every public contract Plans 02–07 import.

- [ ] **Step 1: Write the failing test** — FULL vitest code (imports every cross-plan name from the package root):

```ts
// packages/theming/src/barrel.test.ts
import { describe, it, expect } from "vitest";
import {
  VOCAB_VERSION,
  ivRoles1,
  getRoleGraph,
  requiredContrast,
  isModePolarized,
  classifySeedOrDerived,
  repairTarget,
  OklchColor,
  StyleSpec,
  MAX_RADIUS_PX,
  FontStackId,
  parseSpec,
  AppManifest,
  SHADCN_CAN,
  mergeDelta,
  canonicalize,
  diffSpecs,
} from "./index.js";

describe("@invariance/theming barrel", () => {
  it("re-exports the cross-plan contracts that Plans 02–07 import", () => {
    expect(VOCAB_VERSION).toBe("iv-roles-1");
    expect(typeof getRoleGraph).toBe("function");
    expect(typeof requiredContrast).toBe("function");
    expect(typeof isModePolarized).toBe("function");
    expect(typeof classifySeedOrDerived).toBe("function");
    expect(typeof repairTarget).toBe("function");
    expect(typeof parseSpec).toBe("function");
    expect(typeof mergeDelta).toBe("function");
    expect(typeof canonicalize).toBe("function");
    expect(typeof diffSpecs).toBe("function");
    expect(MAX_RADIUS_PX).toBe(24);
    // schema values are present
    expect(OklchColor.safeParse("#fff").success).toBe(true);
    expect(StyleSpec.safeParse({}).success).toBe(true);
    expect(FontStackId.safeParse("sans").success).toBe(true);
    expect(AppManifest.safeParse(SHADCN_CAN).success).toBe(true);
    expect(ivRoles1.seeds).toContain("neutral");
  });

  it("end-to-end: parse → merge → diff against SHADCN_CAN", () => {
    const a = parseSpec({ colors: { accent: "#3366ff" } }, SHADCN_CAN);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const draft = mergeDelta({} as StyleSpec, a.spec);
    const b = parseSpec({ radius: 12 }, SHADCN_CAN);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const draft2 = mergeDelta(draft, b.spec);
    const diff = diffSpecs(draft, draft2, SHADCN_CAN);
    expect(diff.some((d) => d.role === "radius" && d.kind === "added")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test src/barrel.test.ts`
  Expected failure: import errors — `VOCAB_VERSION`/`parseSpec`/etc. are `undefined` (the root barrel still only has `export {}`).

- [ ] **Step 3: Minimal implementation** — replace `packages/theming/src/index.ts` entirely:

```ts
// packages/theming/src/index.ts
// Barrel re-export of the deterministic core (Plan 01). Plans 02–07 import from here or from the
// per-module subpaths (@invariance/theming/roles, /spec, /manifest, /session).
export * from "./roles/index.js";
export * from "./spec/index.js";
export * from "./manifest/index.js";
export * from "./session/index.js";
```

- [ ] **Step 4: Run the full package suite, verify pass** — `pnpm -F @invariance/theming test && pnpm -F @invariance/theming typecheck`
  Expected: PASS — every test file green (scaffold, roles/types, roles/contrast, roles/iv-roles-1, roles/graph, spec/oklch, spec/style-spec, spec/parse-spec, manifest/schema.shape, manifest/schema.refine, manifest/shadcn-can, session/merge, session/diff, barrel) and `tsc --noEmit` reports no errors.

- [ ] **Step 5: Commit** — `git add packages/theming/src/index.ts packages/theming/src/barrel.test.ts && git commit -m "feat(theming): top-level barrel re-export + end-to-end parse→merge→diff smoke test"`

---

## Done criteria

- `pnpm -F @invariance/theming test` is fully green and `pnpm -F @invariance/theming typecheck` clean.
- The `iv-roles-1` graph, `requiredContrast` f-table, `AppManifest` schema + full named `superRefine` (incl. the blocking base-passes-tier gate), `SHADCN_CAN`, the closed `StyleSpec` + `OklchColor` parse-don't-validate + `parseSpec` wall with seed-lock projection + font allowlist, `mergeDelta`/`canonicalize`, and `diffSpecs` are all exported from `@invariance/theming` with the ledger-verbatim names and signatures.
- Zero compiler, zero verifier, zero LLM in this package (those are Plans 02/03/07).
