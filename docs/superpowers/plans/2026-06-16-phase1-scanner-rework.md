# Phase 1 — Scanner Rework (variable discovery → classification → coverage)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a vendor app's built CSS, produce a *proposed* `variableRoleMap` (the vendor's CSS variables → design roles), a baseline `StyleSpec`, and a coverage report ("% of the color surface drivable") — the onboarding artifacts that qualify ICP fit. The vendor confirms; nothing the engine says is load-bearing for safety.

**Architecture:** Pure, deterministic, additive. A new `packages/cli/src/discover/` module: `vars.ts` statically extracts declared custom properties (name + value + scope) from CSS text; `classify.ts` reuses the existing OKLCH cluster engine (`clusterColors`) to map each hex-color variable to the `--inv-*` role its value lands in, then strips the prefix to the role string the Phase-0 `variableRoleMap` schema expects; `coverage.ts` reports classified/unclassified/non-color split; `index.ts` orchestrates `discoverFromCss` and reuses `inferStyleSpec` for the baseline. A shared `__fixtures__/shadcn-tokens/` CSS fixture is the runnable target (Phase 5 promotes it into the full reference app). No existing code changes except exporting two already-written helpers (`kindFromName`) for reuse.

**Tech Stack:** TypeScript (strict, ESM), vitest, pnpm + turbo. Reuses `@invariance/design/server` (`clusterColors`, `ColorObservation`, `StyleSpec`) and `@invariance/schema` (`VariableRoleMap`, added in Phase 0). Lives in `@invariance/cli`.

---

## Scope & MVP boundaries (read first)

- **Static discovery only.** MVP reads custom properties from **CSS text** (deterministic, testable, no browser). A runtime `getComputedStyle` reader is the *preferred* eventual mode but is **deferred** — out of scope here.
- **Hex color values only.** Classification handles hex (`#rgb`/`#rrggbb`) color values, reusing the cluster engine's normalization so lookups hit. Non-hex color formats (`rgb()`/`hsl()`/`oklch()`) and non-color values (lengths like `--radius: 0.5rem`) are **not classified** — they are reported honestly in coverage (`unclassified` / `nonColor`), never silently dropped. Broadening to `oklch()`/`hsl()` is a fast-follow, noted in the coverage report so the gap is visible.
- **`:root` is the canonical theme.** A variable declared in multiple scopes (e.g. `:root` and `.dark`) is classified once from its `:root` value (or first-seen scope if no `:root`); other scopes are mode variants of the *same* role. The role is mode-independent; the map records `scope`.
- **No persistence / no UI.** This phase produces the proposal *object*. Persisting it to `design-config` and the confirm UI are Phase 4. Wiring `locked`/`allowedModes` enforcement is Phase 2b. This phase emits `locked: false` for every entry (the vendor locks during confirm).

## File structure

| File | Responsibility |
|---|---|
| `packages/cli/src/discover/vars.ts` (create) | `discoverVars(css)` → `DiscoveredVar[]` — static extraction of custom-property declarations with scope. |
| `packages/cli/src/discover/classify.ts` (create) | `classifyVars(vars)` → `{ variableRoleMap, observations, unclassified, nonColor }` — reuse `clusterColors` to map vendor var → role. |
| `packages/cli/src/discover/coverage.ts` (create) | `buildCoverage(result)` → `CoverageReport` — classified/unclassified/nonColor split + `byRole`. |
| `packages/cli/src/discover/index.ts` (create) | `discoverFromCss(css)` → `{ variableRoleMap, styleSpec, coverage }` orchestrator; re-exports. |
| `packages/cli/src/infer-spec.ts` (modify) | Export the existing private `kindFromName` for reuse by `classify.ts`. |
| `__fixtures__/shadcn-tokens/globals.css` (create) | Minimal shadcn/Tailwind-v4-style token CSS — the shared discovery target (Phase 5 promotes to `apps/reference`). |
| `packages/cli/test/discover-vars.test.ts` … `discover.test.ts` (create) | One test file per module + an end-to-end test against the fixture. |

Run focused tests with `pnpm -F @invariance/cli test discover`; run the full package suite with `pnpm -F @invariance/cli test` and confirm no previously-passing CLI test regresses.

---

## Task 1.1: `discoverVars` — static custom-property extraction

**Files:**
- Create: `packages/cli/src/discover/vars.ts`
- Test: `packages/cli/test/discover-vars.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/test/discover-vars.test.ts
import { describe, it, expect } from "vitest";
import { discoverVars } from "../src/discover/vars";

const CSS = `
/* comment with --commented-out: #000; should NOT be discovered */
:root {
  --background: #FFFFFF;
  --primary: #4F46E5;
  --radius: 0.5rem;
}
.dark {
  --background: #0A0A0A;
}
`;

describe("discoverVars", () => {
  it("extracts every declaration with its scope, preserving order", () => {
    const vars = discoverVars(CSS);
    expect(vars).toEqual([
      { name: "--background", value: "#FFFFFF", scope: ":root" },
      { name: "--primary", value: "#4F46E5", scope: ":root" },
      { name: "--radius", value: "0.5rem", scope: ":root" },
      { name: "--background", value: "#0A0A0A", scope: ".dark" },
    ]);
  });

  it("ignores declarations inside comments", () => {
    expect(discoverVars(CSS).some((v) => v.name === "--commented-out")).toBe(false);
  });

  it("returns [] for CSS with no custom properties", () => {
    expect(discoverVars(".btn { color: red; }")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @invariance/cli test discover-vars`
Expected: FAIL — module `../src/discover/vars` does not exist.

- [ ] **Step 3: Implement `discoverVars`**

```ts
// packages/cli/src/discover/vars.ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F @invariance/cli test discover-vars`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/discover/vars.ts packages/cli/test/discover-vars.test.ts
git commit -m "feat(cli): discoverVars — static CSS custom-property extraction"
```

---

## Task 1.2: `classifyVars` — vendor variable → design role (reuse the OKLCH engine)

**Files:**
- Modify: `packages/cli/src/infer-spec.ts` (export `kindFromName`)
- Create: `packages/cli/src/discover/classify.ts`
- Test: `packages/cli/test/discover-classify.test.ts`

- [ ] **Step 1: Export the reused helper**

In `packages/cli/src/infer-spec.ts`, change the existing private declaration

```ts
function kindFromName(name: string): ColorObservation["kind"] {
```

to

```ts
export function kindFromName(name: string): ColorObservation["kind"] {
```

(No other change — `classify.ts` reuses this exact name→kind heuristic so discovery and the legacy repo scan classify identically.)

- [ ] **Step 2: Write the failing test**

```ts
// packages/cli/test/discover-classify.test.ts
import { describe, it, expect } from "vitest";
import { classifyVars, normalizeHex } from "../src/discover/classify";
import type { DiscoveredVar } from "../src/discover/vars";

const VARS: DiscoveredVar[] = [
  { name: "--background", value: "#FFFFFF", scope: ":root" },
  { name: "--foreground", value: "#0A0A0A", scope: ":root" },
  { name: "--primary", value: "#4F46E5", scope: ":root" },
  { name: "--primary-foreground", value: "#FFFFFF", scope: ":root" },
  { name: "--border", value: "#E5E5E5", scope: ":root" },
  { name: "--radius", value: "0.5rem", scope: ":root" },
  { name: "--background", value: "#0A0A0A", scope: ".dark" }, // mode variant — ignored
];

describe("classifyVars", () => {
  it("maps each hex-color var to the role its value lands in", () => {
    const r = classifyVars(VARS);
    expect(r.variableRoleMap["--background"]).toEqual({ role: "surface-0", scope: ":root", locked: false });
    expect(r.variableRoleMap["--foreground"]).toEqual({ role: "text-primary", scope: ":root", locked: false });
    expect(r.variableRoleMap["--primary"]).toEqual({ role: "accent", scope: ":root", locked: false });
    expect(r.variableRoleMap["--border"]).toEqual({ role: "border", scope: ":root", locked: false });
  });

  it("reports a hex color that won no role as unclassified", () => {
    // #FFFFFF as text on a #FFFFFF surface fails the readability floor -> no role.
    expect(classifyVars(VARS).unclassified).toContain("--primary-foreground");
  });

  it("reports non-color values (lengths) as nonColor, not unclassified", () => {
    const r = classifyVars(VARS);
    expect(r.nonColor).toContain("--radius");
    expect(r.unclassified).not.toContain("--radius");
  });

  it("classifies from the :root value, not the .dark variant", () => {
    // --background is mapped once (surface-0), keyed by name, scope ":root".
    expect(classifyVars(VARS).variableRoleMap["--background"]!.scope).toBe(":root");
  });

  it("normalizeHex canonicalizes 3-digit and lowercase to uppercase #RRGGBB", () => {
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("#4f46e5")).toBe("#4F46E5");
    expect(normalizeHex("0.5rem")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm -F @invariance/cli test discover-classify`
Expected: FAIL — module `../src/discover/classify` does not exist.

- [ ] **Step 4: Implement `classifyVars`**

```ts
// packages/cli/src/discover/classify.ts
import { clusterColors, type ColorObservation } from "@invariance/design/server";
import type { VariableRoleMap } from "@invariance/schema";
import { kindFromName } from "../infer-spec";
import type { DiscoveredVar } from "./vars";

/**
 * Normalize a 3/6-digit hex to uppercase #RRGGBB. Mirrors the cluster engine's
 * own normalization (packages/design/src/compiler/cluster.ts) so the varToRole
 * lookup keys (`${kind}:${hex}`) match exactly. Returns undefined for any
 * non-hex value (lengths, rgb()/hsl()/oklch()) — MVP classifies hex colors;
 * broader formats are a fast-follow (reported as gaps, never silently dropped).
 */
export function normalizeHex(value: string): string | undefined {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim());
  if (!m || !m[1]) return undefined;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
  return `#${hex.toUpperCase()}`;
}

export interface ClassifyResult {
  /** Vendor var name -> { role, scope, locked:false }. The genuinely new artifact. */
  variableRoleMap: VariableRoleMap;
  /** Color observations, for inferStyleSpec (the baseline theme). */
  observations: ColorObservation[];
  /** Hex-color vars that won no role (kept honest in coverage). */
  unclassified: string[];
  /** Vars whose value is not a hex color (lengths, or formats not yet parsed). */
  nonColor: string[];
}

/**
 * Classify discovered variables into design roles by reusing the OKLCH cluster
 * engine: each hex-color var becomes a ColorObservation (kind from its name),
 * clusterColors assigns the `--inv-*` roles, and each var is mapped to the role
 * its value landed in (via varToRole), stripped to the role string the
 * variableRoleMap schema expects. Only `:root`-scoped declarations are
 * classified (the canonical/base theme); other scopes are mode variants.
 */
export function classifyVars(vars: DiscoveredVar[]): ClassifyResult {
  // Canonical declaration per name: prefer :root, else first-seen scope.
  const canonical = new Map<string, DiscoveredVar>();
  for (const v of vars) {
    const existing = canonical.get(v.name);
    if (!existing || (existing.scope !== ":root" && v.scope === ":root")) {
      canonical.set(v.name, v);
    }
  }

  const observations: ColorObservation[] = [];
  const colorVars: Array<{ name: string; kind: ColorObservation["kind"]; hex: string; scope: string }> = [];
  const nonColor: string[] = [];

  for (const v of canonical.values()) {
    const hex = normalizeHex(v.value);
    if (!hex) {
      nonColor.push(v.name);
      continue;
    }
    const kind = kindFromName(v.name);
    observations.push({ hex, kind });
    colorVars.push({ name: v.name, kind, hex, scope: v.scope });
  }

  const { varToRole } = clusterColors(observations);

  const variableRoleMap: VariableRoleMap = {};
  const unclassified: string[] = [];
  for (const cv of colorVars) {
    const token = varToRole.get(`${cv.kind}:${cv.hex}`);
    if (!token) {
      unclassified.push(cv.name);
      continue;
    }
    variableRoleMap[cv.name] = {
      role: token.slice("--inv-".length),
      scope: cv.scope,
      locked: false,
    };
  }

  return { variableRoleMap, observations, unclassified, nonColor };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm -F @invariance/cli test discover-classify`
Expected: PASS (all five cases). If the role assertions surprise you, print `clusterColors(observations)` — the engine is the source of truth; the fixture values above are chosen to land deterministically.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/infer-spec.ts packages/cli/src/discover/classify.ts packages/cli/test/discover-classify.test.ts
git commit -m "feat(cli): classifyVars — map vendor CSS vars to design roles via the OKLCH engine"
```

---

## Task 1.3: `buildCoverage` — the ICP-fit report

**Files:**
- Create: `packages/cli/src/discover/coverage.ts`
- Test: `packages/cli/test/discover-coverage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/test/discover-coverage.test.ts
import { describe, it, expect } from "vitest";
import { buildCoverage } from "../src/discover/coverage";
import type { ClassifyResult } from "../src/discover/classify";

const RESULT: ClassifyResult = {
  variableRoleMap: {
    "--background": { role: "surface-0", scope: ":root", locked: false },
    "--foreground": { role: "text-primary", scope: ":root", locked: false },
    "--primary": { role: "accent", scope: ":root", locked: false },
    "--border": { role: "border", scope: ":root", locked: false },
  },
  observations: [],
  unclassified: ["--primary-foreground"],
  nonColor: ["--radius"],
};

describe("buildCoverage", () => {
  it("computes coverage over color vars (classified / (classified + unclassified))", () => {
    const c = buildCoverage(RESULT);
    expect(c.classified).toHaveLength(4);
    expect(c.coverage).toBeCloseTo(0.8, 5); // 4 of 5 color vars drivable
    expect(c.unclassified).toEqual(["--primary-foreground"]);
    expect(c.nonColor).toEqual(["--radius"]); // excluded from the coverage denominator
  });

  it("groups vars by role", () => {
    expect(buildCoverage(RESULT).byRole).toEqual({
      "surface-0": ["--background"],
      "text-primary": ["--foreground"],
      accent: ["--primary"],
      border: ["--border"],
    });
  });

  it("reports 0 coverage (not NaN) when there are no color vars", () => {
    expect(buildCoverage({ variableRoleMap: {}, observations: [], unclassified: [], nonColor: ["--radius"] }).coverage).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @invariance/cli test discover-coverage`
Expected: FAIL — module `../src/discover/coverage` does not exist.

- [ ] **Step 3: Implement `buildCoverage`**

```ts
// packages/cli/src/discover/coverage.ts
import type { ClassifyResult } from "./classify";

/** Onboarding ICP-fit report: how much of the app's color surface is drivable. */
export interface CoverageReport {
  /** Color vars mapped to a role. */
  classified: string[];
  /** Color vars with no role (incl. color formats not yet parsed). */
  unclassified: string[];
  /** Vars whose value is not a color (lengths, etc.) — excluded from coverage. */
  nonColor: string[];
  /** classified / (classified + unclassified) — "% of color surface drivable"; 0 when none. */
  coverage: number;
  /** role -> the vendor vars driving it. */
  byRole: Record<string, string[]>;
}

export function buildCoverage(result: ClassifyResult): CoverageReport {
  const classified = Object.keys(result.variableRoleMap);
  const colorTotal = classified.length + result.unclassified.length;
  const byRole: Record<string, string[]> = {};
  for (const [name, entry] of Object.entries(result.variableRoleMap)) {
    (byRole[entry.role] ??= []).push(name);
  }
  return {
    classified,
    unclassified: result.unclassified,
    nonColor: result.nonColor,
    coverage: colorTotal === 0 ? 0 : classified.length / colorTotal,
    byRole,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F @invariance/cli test discover-coverage`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/discover/coverage.ts packages/cli/test/discover-coverage.test.ts
git commit -m "feat(cli): buildCoverage — color-surface coverage report for onboarding"
```

---

## Task 1.4: `discoverFromCss` orchestrator + shared fixture (end-to-end)

**Files:**
- Create: `__fixtures__/shadcn-tokens/globals.css`
- Create: `packages/cli/src/discover/index.ts`
- Test: `packages/cli/test/discover.test.ts`

- [ ] **Step 1: Create the shared fixture**

```css
/* __fixtures__/shadcn-tokens/globals.css
   Minimal shadcn / Tailwind-v4 token layer — the shared discovery target for
   Phases 1-3. Phase 5 promotes this into the full apps/reference app.
   Hex values (MVP); real shadcn uses oklch()/hsl() (a discovery fast-follow). */
:root {
  --background: #FFFFFF;
  --foreground: #0A0A0A;
  --primary: #4F46E5;
  --primary-foreground: #FFFFFF;
  --border: #E5E5E5;
  --radius: 0.5rem;
}
.dark {
  --background: #0A0A0A;
  --foreground: #FAFAFA;
}
```

- [ ] **Step 2: Write the failing end-to-end test**

```ts
// packages/cli/test/discover.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { discoverFromCss } from "../src/discover";

const here = dirname(fileURLToPath(import.meta.url)); // .../packages/cli/test
const css = readFileSync(
  resolve(here, "../../../__fixtures__/shadcn-tokens/globals.css"),
  "utf8",
);

describe("discoverFromCss (end-to-end against the shadcn-tokens fixture)", () => {
  const result = discoverFromCss(css);

  it("proposes a variableRoleMap a human would accept with light edits", () => {
    expect(result.variableRoleMap["--primary"]!.role).toBe("accent");
    expect(result.variableRoleMap["--background"]!.role).toBe("surface-0");
    expect(result.variableRoleMap["--foreground"]!.role).toBe("text-primary");
    expect(result.variableRoleMap["--border"]!.role).toBe("border");
  });

  it("reports honest coverage of the color surface", () => {
    expect(result.coverage.coverage).toBeCloseTo(0.8, 5); // 4 of 5 color vars
    expect(result.coverage.nonColor).toContain("--radius");
    expect(result.coverage.unclassified).toContain("--primary-foreground");
  });

  it("infers a coherent baseline StyleSpec (light, since surface-0 is white)", () => {
    expect(result.styleSpec.mode).toBe("light");
    expect(typeof result.styleSpec.accentHue).toBe("number");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm -F @invariance/cli test discover.test`
Expected: FAIL — module `../src/discover` (index) does not exist. (If the fixture path resolves wrong for your runner, adjust the relative path so it points at the repo-root `__fixtures__/shadcn-tokens/globals.css`.)

- [ ] **Step 4: Implement the orchestrator**

```ts
// packages/cli/src/discover/index.ts
import type { StyleSpec } from "@invariance/design/server";
import type { VariableRoleMap } from "@invariance/schema";
import { inferStyleSpec } from "../infer-spec";
import { discoverVars } from "./vars";
import { classifyVars } from "./classify";
import { buildCoverage, type CoverageReport } from "./coverage";

/** The onboarding proposal: what the vendor confirms in the dashboard (Phase 4). */
export interface DiscoverResult {
  variableRoleMap: VariableRoleMap;
  styleSpec: StyleSpec;
  coverage: CoverageReport;
}

/**
 * Discover → classify → coverage, plus a baseline StyleSpec, from a vendor's
 * built CSS. Deterministic and side-effect-free. The proposal is advisory;
 * the vendor confirms it (Phase 4) before it governs anything.
 */
export function discoverFromCss(css: string): DiscoverResult {
  const vars = discoverVars(css);
  const classified = classifyVars(vars);
  return {
    variableRoleMap: classified.variableRoleMap,
    styleSpec: inferStyleSpec(classified.observations),
    coverage: buildCoverage(classified),
  };
}

export type { DiscoveredVar } from "./vars";
export type { ClassifyResult } from "./classify";
export type { CoverageReport } from "./coverage";
export { discoverVars } from "./vars";
export { classifyVars, normalizeHex } from "./classify";
export { buildCoverage } from "./coverage";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm -F @invariance/cli test discover.test`
Expected: PASS (all three cases).

- [ ] **Step 6: Run the full discover suite + full CLI suite (no regressions)**

Run: `pnpm -F @invariance/cli test discover` then `pnpm -F @invariance/cli test`
Expected: all discover tests pass; every previously-passing CLI test still passes.

- [ ] **Step 7: Commit**

```bash
git add __fixtures__/shadcn-tokens/globals.css packages/cli/src/discover/index.ts packages/cli/test/discover.test.ts
git commit -m "feat(cli): discoverFromCss orchestrator + shared shadcn-tokens fixture"
```

---

## Phase 1 exit criteria

Point the discovery pipeline at the shadcn/Tailwind-v4-style fixture and get back a proposed `variableRoleMap` (vendor var → role), a baseline `StyleSpec`, and a coverage report whose number a human would accept with light edits (≈80% on the fixture, with the one unreadable token and the non-color length honestly reported as gaps). `pnpm -F @invariance/cli test` green; no existing CLI behavior changed (only `kindFromName` newly exported).

---

## Self-review (writing-plans checklist)

- **Spec coverage (roadmap Phase 1):** "discover live vars → classify → proposed `variableRoleMap` + `StyleSpec` + coverage" — Tasks 1.1 (discover), 1.2 (classify → map), 1.3 (coverage), 1.4 (orchestrator + StyleSpec via `inferStyleSpec` + the shared fixture the roadmap moved into Phase 1). Reuse of `clusterColors` + `inferStyleSpec` is explicit (Tasks 1.2, 1.4). The runtime `getComputedStyle` reader and non-hex color formats are explicitly deferred and reported, not silently skipped.
- **Placeholder scan:** every code/step is concrete — real module code, real test code, exact commands, exact commits. No TBDs.
- **Type consistency:** `DiscoveredVar` (1.1) is consumed unchanged by `classifyVars` (1.2) and `discoverFromCss` (1.4); `ClassifyResult` (1.2) is consumed by `buildCoverage` (1.3) and the orchestrator (1.4); `CoverageReport` (1.3) is surfaced in `DiscoverResult` (1.4). `variableRoleMap` entries are built as `{ role, scope, locked }` to match the Phase-0 `VariableRoleSchema`. `kindFromName` is exported in 1.2 and imported by `classify.ts`; `normalizeHex` is defined in 1.2 and re-exported in 1.4.
- **Determinism caveat:** the fixture values are chosen so `clusterColors` assigns roles deterministically (white surface-0, dark readable text, single chromatic accent). If the engine's heuristics change, Task 1.2/1.4 assertions are the canary — update the fixture, not the engine.
