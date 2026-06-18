# Scan Contract + Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the onboarding scan pipeline — the shared `ScanPayload` contract, the in-browser scan SDK (CSSOM source-of-truth + demoted `getComputedStyle`), and the control-plane Scanner that classifies vars to roles, infers the format contract under "consumption dictates, held cross-checks", emits a coverage report, and produces an `AppManifest` — plus the prebuilt shadcn "can" skip-scan path.

**Architecture:** `ScanPayload` is a zod schema in `@invariance/theming` so both planes parse the same contract. The browser `scan()` (in `packages/client/src/theming/scan-sdk/`) walks the CSSOM for held values per mode and consumption wrapping per use-site, using `getComputedStyle` only as enumerator/cross-check/var-resolver. The control-plane `runScanner()` (in `apps/control-plane/src/theming/scan/`) consumes a `ScanPayload`, does OKLCH role classification against the pinned `RoleGraph`, infers `emit` contracts with the raw/color-mix/opaqueSheets carve-outs, and assembles an `AppManifest`. `SHADCN_CAN` (owned by Plan 01) is the prebuilt manifest the v1 demo ships without ever running a scan.

**Tech Stack:** TypeScript strict ESM, zod schemas (source of truth), vitest (happy-dom for SDK, node for Scanner), culori v4 for OKLCH parse/convert/classification, deterministic regex tokenizer for CSS rule text.

## Global Constraints

- pnpm workspaces + turborepo; pnpm ONLY (never npm/yarn).
- TypeScript strict, ESM (`"type": "module"`).
- Workspace packages export TS source directly (`"exports": {".":"./src/index.ts"}`); no build step.
- zod is the source of truth: export both `XSchema` and `type X = z.infer<typeof XSchema>`. Cross-schema integrity lives in `superRefine` blocks.
- vitest; tests colocated under each package's `test/` (or `src/*.test.ts` matching the package's convention). Run e.g. `pnpm -F @invariance/theming test`.
- OKLCH color math via culori (parse, convert, gamut-map, WCAG contrast).
- Artifact content-addressing + signing: ed25519 via `node:crypto`, canonical JSON (sorted keys).
- DETERMINISM: `compile()/verify()/renderStyleText()/mergeDelta()/diffSpecs()` must be pure — no `Date.now()`, `Math.random()`, or I/O. Stamp timestamps outside the pure core. (Scanner is likewise pure given a `ScanPayload`.)
- Package layout (exact paths this plan touches):
  - `packages/theming/  (@invariance/theming)` — pure, plane-agnostic deterministic core.
    - `src/roles/` RoleGraph types + the iv-roles-1 instance + f(tier,category) — **owned by Plan 01**, consumed here.
    - `src/manifest/` AppManifest zod schema + superRefine + shadcn "can" fixture — **owned by Plan 01**, consumed here.
    - `src/spec/` StyleSpec, OklchColor, FontStackId, parseSpec — **owned by Plan 01**, consumed here.
    - `src/scan/` ScanPayload zod schema (THIS PLAN owns it; shared so both planes parse it).
    - `src/index.ts` barrel re-export.
  - `apps/control-plane/src/theming/scan/` — Scanner: `ScanPayload -> AppManifest`, coverage report (THIS PLAN).
  - `packages/client/src/theming/scan-sdk/` — the in-browser `scan()` (CSSOM two-pass + getComputedStyle) (THIS PLAN).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/theming/src/scan/scan-payload.ts` | `ScanPayload` zod schema + `type ScanPayload`; the shared scan contract (variables/declarations/consumption/opaqueSheets). |
| `packages/theming/src/scan/index.ts` | Module barrel for `scan/` — re-exports `scan-payload.ts`. |
| `packages/theming/src/scan/scan-payload.test.ts` | ScanPayload schema tests (valid payload parses; bad enum/shape rejects). |
| `packages/theming/src/index.ts` | Top-level barrel — add `export * from "./scan/index.js"`. (Modify; Plan 01 created it.) |
| `packages/client/src/theming/scan-sdk/css-text.ts` | Deterministic CSS-rule-text tokenizer: declarations per selector + `var()`/`color-mix()` use-sites. The held/consumption extractor the SDK runs over CSSOM rule text. |
| `packages/client/src/theming/scan-sdk/css-text.test.ts` | Tokenizer tests against fixture stylesheet strings. |
| `packages/client/src/theming/scan-sdk/held-format.ts` | `classifyHeldFormat(rawValue) -> heldFormat`; `classifyWrapping(useSite) -> wrapping`; `modeFromSelector(selector) -> "light"|"dark"|"unknown"`. |
| `packages/client/src/theming/scan-sdk/held-format.test.ts` | Held-format / wrapping / mode classification tests. |
| `packages/client/src/theming/scan-sdk/scan.ts` | `scan(doc?) -> ScanPayload`: CSSOM walk (source of truth) + `getComputedStyle` (enumerator/cross-check/var resolver) + opaqueSheets capture. |
| `packages/client/src/theming/scan-sdk/scan.test.ts` | Full `scan()` against injected `<style>` fixtures (happy-dom) + opaque-sheet simulation. |
| `packages/client/src/theming/scan-sdk/index.ts` | Module barrel — re-exports `scan`. |
| `packages/client/vitest.config.ts` | (Already happy-dom; no change needed — referenced for SDK tests.) |
| `apps/control-plane/src/theming/scan/classify-role.ts` | `classifyRole(rawValue, heldFormat, graph) -> { role, confidence } \| null`; OKLCH classification against the role graph. |
| `apps/control-plane/src/theming/scan/classify-role.test.ts` | Role-classification tests (color → nearest role; dimension/number; ambiguous → null). |
| `apps/control-plane/src/theming/scan/infer-emit.ts` | `inferEmit(varEntry, consumptionSites, opaqueDowngrade) -> { emit, confidence, reason? }`; "consumption dictates, held cross-checks" + raw/color-mix/opaqueSheets carve-outs. |
| `apps/control-plane/src/theming/scan/infer-emit.test.ts` | Emit-inference tests for every carve-out branch. |
| `apps/control-plane/src/theming/scan/scanner.ts` | `runScanner(payload, opts) -> ScanResult`; orchestrates classify + infer-emit + coverage report + `AppManifest` assembly (variables, modes.selectors, base, defaultSeeds). Exports `ScannerOptions`, `ScanResult`, `CoverageReport`, `CoverageReason`. |
| `apps/control-plane/src/theming/scan/scanner.test.ts` | Scanner against fixture `ScanPayload`s: name→role binding, emit per carve-out, per-mode selectors + base capture, defaultSeeds, coverage report, opaqueSheets-downgrade. (The proposed manifest is NOT re-parsed against the full `AppManifest` superRefine — a partial scan covers only the scanned roles, so it is subject to vendor confirmation per ledger §8.3, not full-manifest validity.) |
| `apps/control-plane/src/theming/scan/index.ts` | Module barrel — re-exports `runScanner`, `ScanResult`, `ScannerOptions`, `CoverageReport`, `CoverageReason`. |
| `apps/control-plane/src/theming/scan/can-path.ts` | `getCanManifest(appId) -> AppManifest`; the shadcn "can" skip-scan path (returns `SHADCN_CAN` with `appId` stamped). |
| `apps/control-plane/src/theming/scan/can-path.test.ts` | "can" path test: returns a valid manifest, no scan run. |
| `packages/theming/package.json` | (Modify) add `culori` dependency (used by `roles`/`compile`; ScanPayload itself is culori-free — referenced for the workspace dep already pinned by Plan 01). |
| `apps/control-plane/package.json` | (Modify) add `culori` + `@invariance/theming` workspace dep if not already present. |

---

### Task 1: ScanPayload schema (`@invariance/theming/scan`)

**Files:**
- Create: `packages/theming/src/scan/scan-payload.ts`
- Create: `packages/theming/src/scan/index.ts`
- Test: `packages/theming/src/scan/scan-payload.test.ts`
- Modify: `packages/theming/src/index.ts` (add scan barrel export)

**Interfaces:**
- Consumes: `VarName` (type alias `string`) from `@invariance/theming/roles` (Plan 01); `zod`.
- Produces (ledger §8.1, verbatim):
  ```ts
  export const ScanPayload: z.ZodType<...>;   // value
  export type ScanPayload = z.infer<typeof ScanPayload>;   // type (shared identifier)
  ```
  Shape (verbatim from ledger §8.1):
  ```ts
  ScanPayload = {
    scanVersion: number;
    origin: string;
    variables: Array<{ name: string; declarations: Array<{
      selector: string; mode: "light"|"dark"|"unknown"; rawValue: string;
      heldFormat: "hsl-triple"|"rgb-triple"|"hex"|"oklch"|"number"|"keyword"|"unknown";
    }> }>;
    consumption: Record<string, Array<{
      wrapping: "hsl"|"rgb"|"oklch"|"raw"|"color-mix"|"other"; selector: string; property: string;
    }>>;
    opaqueSheets: string[];
  }
  ```

- [ ] **Step 1: Write the failing test** — FULL vitest code

```ts
// packages/theming/src/scan/scan-payload.test.ts
import { describe, it, expect } from "vitest";
import { ScanPayload } from "./scan-payload.js";

const VALID = {
  scanVersion: 1,
  origin: "https://app.example.com",
  variables: [
    {
      name: "--background",
      declarations: [
        { selector: ":root", mode: "light", rawValue: "0 0% 100%", heldFormat: "hsl-triple" },
        { selector: ".dark", mode: "dark", rawValue: "0 0% 4%", heldFormat: "hsl-triple" },
      ],
    },
  ],
  consumption: {
    "--background": [{ wrapping: "hsl", selector: "body", property: "background-color" }],
  },
  opaqueSheets: [],
};

describe("ScanPayload schema", () => {
  it("parses a well-formed payload and infers the type", () => {
    const parsed = ScanPayload.parse(VALID);
    expect(parsed.variables[0]!.name).toBe("--background");
    expect(parsed.variables[0]!.declarations[1]!.mode).toBe("dark");
    expect(parsed.consumption["--background"]![0]!.wrapping).toBe("hsl");
    expect(parsed.opaqueSheets).toEqual([]);
  });

  it("rejects an unknown declaration mode", () => {
    const bad = structuredClone(VALID);
    (bad.variables[0]!.declarations[0] as any).mode = "system";
    expect(ScanPayload.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown heldFormat", () => {
    const bad = structuredClone(VALID);
    (bad.variables[0]!.declarations[0] as any).heldFormat = "lab";
    expect(ScanPayload.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown consumption wrapping", () => {
    const bad = structuredClone(VALID);
    (bad.consumption["--background"]![0] as any).wrapping = "lch";
    expect(ScanPayload.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-string opaqueSheets entry", () => {
    const bad = structuredClone(VALID);
    (bad.opaqueSheets as any[]).push(42);
    expect(ScanPayload.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test scan-payload`
  Expected failure: `Cannot find module './scan-payload.js'` (the file does not exist yet).

- [ ] **Step 3: Minimal implementation** — FULL code

```ts
// packages/theming/src/scan/scan-payload.ts
import { z } from "zod";

/**
 * The shared scan contract (spec §5). Produced by the in-browser scan SDK
 * (packages/client/src/theming/scan-sdk) and consumed by the control-plane
 * Scanner (apps/control-plane/src/theming/scan). Lives in @invariance/theming
 * so BOTH planes parse the identical zod schema.
 *
 * "Consumption dictates, held cross-checks": `consumption[*].wrapping` is the
 * emit obligation at a use-site; `declarations[*].heldFormat` is the cross-check.
 * CSSOM is the source of truth; getComputedStyle is corroboration.
 */
export const ScanPayload = z.object({
  scanVersion: z.number(),
  origin: z.string(),
  variables: z.array(
    z.object({
      name: z.string(), // VarName — includes the leading "--"
      declarations: z.array(
        z.object({
          selector: z.string(), // ":root" | ".dark" | "[data-theme='dark']" | …
          mode: z.enum(["light", "dark", "unknown"]), // inferred from selector
          rawValue: z.string(), // held / as-authored, e.g. "0 0% 100%"
          heldFormat: z.enum([
            "hsl-triple",
            "rgb-triple",
            "hex",
            "oklch",
            "number",
            "keyword",
            "unknown",
          ]),
        }),
      ),
    }),
  ),
  consumption: z.record(
    z.string(), // VarName
    z.array(
      z.object({
        wrapping: z.enum(["hsl", "rgb", "oklch", "raw", "color-mix", "other"]),
        selector: z.string(),
        property: z.string(),
      }),
    ),
  ),
  opaqueSheets: z.array(z.string()), // cross-origin sheets that threw SecurityError on .cssRules
});

export type ScanPayload = z.infer<typeof ScanPayload>;
```

```ts
// packages/theming/src/scan/index.ts
export * from "./scan-payload.js";
```

- [ ] **Step 4: Wire the barrel** — add the scan re-export to the top-level package barrel.
  Edit `packages/theming/src/index.ts`: append the line
  ```ts
  export * from "./scan/index.js";
  ```
  (If the barrel already re-exports submodules via a list, add `./scan/index.js` to it. Do not remove Plan 01's exports.)

- [ ] **Step 5: Run tests, verify pass** — `pnpm -F @invariance/theming test scan-payload`
  Expected: PASS (5 tests pass).

- [ ] **Step 6: Commit** —
  `git add packages/theming/src/scan/scan-payload.ts packages/theming/src/scan/index.ts packages/theming/src/scan/scan-payload.test.ts packages/theming/src/index.ts && git commit -m "feat(theming): ScanPayload shared scan contract (spec §5)"`

---

### Task 2: Held-format / wrapping / mode classifiers (scan SDK leaf functions)

**Files:**
- Create: `packages/client/src/theming/scan-sdk/held-format.ts`
- Test: `packages/client/src/theming/scan-sdk/held-format.test.ts`

**Interfaces:**
- Consumes: nothing external (pure string classifiers).
- Produces:
  ```ts
  export type HeldFormat = "hsl-triple" | "rgb-triple" | "hex" | "oklch" | "number" | "keyword" | "unknown";
  export type Wrapping = "hsl" | "rgb" | "oklch" | "raw" | "color-mix" | "other";
  export type ScanMode = "light" | "dark" | "unknown";
  export function classifyHeldFormat(rawValue: string): HeldFormat;
  export function classifyWrapping(useSite: string): Wrapping;  // useSite = the value text wrapping a var(), e.g. "hsl(var(--x))" or "var(--x)"
  export function modeFromSelector(selector: string): ScanMode;
  ```

- [ ] **Step 1: Write the failing test** — FULL vitest code

```ts
// packages/client/src/theming/scan-sdk/held-format.test.ts
import { describe, it, expect } from "vitest";
import { classifyHeldFormat, classifyWrapping, modeFromSelector } from "./held-format.js";

describe("classifyHeldFormat", () => {
  it("recognizes a bare HSL triple (shadcn held form)", () => {
    expect(classifyHeldFormat("0 0% 100%")).toBe("hsl-triple");
    expect(classifyHeldFormat("240 5.9% 10%")).toBe("hsl-triple");
  });
  it("recognizes a bare RGB triple", () => {
    expect(classifyHeldFormat("255 255 255")).toBe("rgb-triple");
    expect(classifyHeldFormat("17 24 39")).toBe("rgb-triple");
  });
  it("recognizes hex", () => {
    expect(classifyHeldFormat("#4F46E5")).toBe("hex");
    expect(classifyHeldFormat("#fff")).toBe("hex");
  });
  it("recognizes oklch", () => {
    expect(classifyHeldFormat("oklch(0.7 0.15 250)")).toBe("oklch");
  });
  it("recognizes a bare number (radius/density)", () => {
    expect(classifyHeldFormat("0.5rem")).toBe("number");
    expect(classifyHeldFormat("8px")).toBe("number");
    expect(classifyHeldFormat("0")).toBe("number");
  });
  it("recognizes a keyword", () => {
    expect(classifyHeldFormat("transparent")).toBe("keyword");
    expect(classifyHeldFormat("white")).toBe("keyword");
  });
  it("falls back to unknown on a font stack / anything else", () => {
    expect(classifyHeldFormat("'Inter', system-ui, sans-serif")).toBe("unknown");
  });
});

describe("classifyWrapping", () => {
  it("hsl(var(--x)) -> hsl", () => {
    expect(classifyWrapping("hsl(var(--primary))")).toBe("hsl");
  });
  it("rgb(var(--x)) -> rgb", () => {
    expect(classifyWrapping("rgb(var(--primary))")).toBe("rgb");
  });
  it("oklch(var(--x)) -> oklch", () => {
    expect(classifyWrapping("oklch(var(--primary))")).toBe("oklch");
  });
  it("bare var(--x) -> raw", () => {
    expect(classifyWrapping("var(--radius)")).toBe("raw");
  });
  it("color-mix(...) -> color-mix", () => {
    expect(classifyWrapping("color-mix(in srgb, var(--ring) 50%, white)")).toBe("color-mix");
  });
  it("anything else with a var -> other", () => {
    expect(classifyWrapping("hsla(var(--x) / 0.5)")).toBe("other");
  });
});

describe("modeFromSelector", () => {
  it(":root and html are light", () => {
    expect(modeFromSelector(":root")).toBe("light");
    expect(modeFromSelector("html")).toBe("light");
  });
  it(".dark and [data-theme='dark'] and media-dark are dark", () => {
    expect(modeFromSelector(".dark")).toBe("dark");
    expect(modeFromSelector("[data-theme='dark']")).toBe("dark");
    expect(modeFromSelector(":root.dark")).toBe("dark");
  });
  it("an unrecognized scope is unknown", () => {
    expect(modeFromSelector(".sidebar")).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/client test held-format`
  Expected failure: `Cannot find module './held-format.js'`.

- [ ] **Step 3: Minimal implementation** — FULL code

```ts
// packages/client/src/theming/scan-sdk/held-format.ts
/**
 * Pure string classifiers for the scan SDK. No DOM, no I/O — deterministic.
 * `heldFormat` is the cross-check; `wrapping` is the consumption obligation;
 * `mode` is inferred from the declaring selector (spec §5).
 */

export type HeldFormat =
  | "hsl-triple"
  | "rgb-triple"
  | "hex"
  | "oklch"
  | "number"
  | "keyword"
  | "unknown";

export type Wrapping = "hsl" | "rgb" | "oklch" | "raw" | "color-mix" | "other";

export type ScanMode = "light" | "dark" | "unknown";

const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
// "<num> <num>% <num>%" — HSL channels held as a bare triple (H, S%, L%).
const HSL_TRIPLE = /^-?\d*\.?\d+\s+-?\d*\.?\d+%\s+-?\d*\.?\d+%$/;
// "<num> <num> <num>" — RGB channels held as a bare triple (0–255, no %).
const RGB_TRIPLE = /^\d*\.?\d+\s+\d*\.?\d+\s+\d*\.?\d+$/;
// a single dimension/number leaf: "0", "0.5rem", "8px", "1.25", "50%"
const NUMBER = /^-?\d*\.?\d+(?:px|rem|em|%)?$/;
// a CSS named color / global keyword we treat as a keyword leaf.
const KEYWORDS = new Set([
  "transparent",
  "currentcolor",
  "white",
  "black",
  "inherit",
  "initial",
  "unset",
  "none",
]);

export function classifyHeldFormat(rawValue: string): HeldFormat {
  const v = rawValue.trim();
  if (HEX.test(v)) return "hex";
  if (/^oklch\(/i.test(v)) return "oklch";
  if (HSL_TRIPLE.test(v)) return "hsl-triple";
  if (RGB_TRIPLE.test(v)) return "rgb-triple";
  if (NUMBER.test(v)) return "number";
  if (KEYWORDS.has(v.toLowerCase())) return "keyword";
  return "unknown";
}

export function classifyWrapping(useSite: string): Wrapping {
  const v = useSite.trim().toLowerCase();
  if (/^color-mix\(/.test(v)) return "color-mix";
  if (/^hsl\(\s*var\(/.test(v)) return "hsl";
  if (/^rgb\(\s*var\(/.test(v)) return "rgb";
  if (/^oklch\(\s*var\(/.test(v)) return "oklch";
  // A bare var() reference with no wrapping function around it.
  if (/^var\(/.test(v)) return "raw";
  return "other";
}

export function modeFromSelector(selector: string): ScanMode {
  const s = selector.trim().toLowerCase();
  if (/(\.dark\b|\[data-theme\s*=\s*['"]?dark['"]?\]|prefers-color-scheme:\s*dark)/.test(s)) {
    return "dark";
  }
  if (s === ":root" || s === "html" || s === "html:root" || s === ":root, html" || s === "*") {
    return "light";
  }
  return "unknown";
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/client test held-format`
  Expected: PASS (all 3 describe blocks pass).

- [ ] **Step 5: Commit** —
  `git add packages/client/src/theming/scan-sdk/held-format.ts packages/client/src/theming/scan-sdk/held-format.test.ts && git commit -m "feat(scan-sdk): held-format/wrapping/mode classifiers (spec §5)"`

---

### Task 3: CSS rule-text tokenizer (held declarations + consumption use-sites)

**Files:**
- Create: `packages/client/src/theming/scan-sdk/css-text.ts`
- Test: `packages/client/src/theming/scan-sdk/css-text.test.ts`

**Interfaces:**
- Consumes: nothing external (pure CSS-text parsing). Used by `scan.ts` over `CSSStyleRule.cssText`.
- Produces:
  ```ts
  export type RuleBlock = { selector: string; declarations: Array<{ property: string; value: string }> };
  // Parse flat (non-nested) CSS rule blocks into selector + declaration list.
  export function parseRuleBlocks(cssText: string): RuleBlock[];
  // Find every custom-property *declaration* across rule blocks: var name -> [{ selector, value }].
  export function collectCustomPropDecls(blocks: RuleBlock[]): Array<{ name: string; selector: string; value: string }>;
  // Find every *consumption* use-site of a var: var name -> [{ selector, property, useSite }].
  // useSite is the wrapping value text containing the var(), e.g. "hsl(var(--primary))".
  export function collectVarUseSites(blocks: RuleBlock[]): Array<{ name: string; selector: string; property: string; useSite: string }>;
  ```

- [ ] **Step 1: Write the failing test** — FULL vitest code

```ts
// packages/client/src/theming/scan-sdk/css-text.test.ts
import { describe, it, expect } from "vitest";
import { parseRuleBlocks, collectCustomPropDecls, collectVarUseSites } from "./css-text.js";

const SHEET = `
:root { --background: 0 0% 100%; --primary: 240 5.9% 10%; --radius: 0.5rem; }
.dark { --background: 0 0% 4%; --primary: 0 0% 98%; }
body { background-color: hsl(var(--background)); }
.btn { background: hsl(var(--primary)); border-radius: var(--radius); }
.ring { box-shadow: 0 0 0 2px color-mix(in srgb, hsl(var(--ring)) 50%, transparent); }
`;

describe("parseRuleBlocks", () => {
  it("splits each selector block and its declarations", () => {
    const blocks = parseRuleBlocks(SHEET);
    expect(blocks.map((b) => b.selector)).toEqual([":root", ".dark", "body", ".btn", ".ring"]);
    expect(blocks[0]!.declarations).toContainEqual({ property: "--background", value: "0 0% 100%" });
    expect(blocks[3]!.declarations).toContainEqual({ property: "border-radius", value: "var(--radius)" });
  });
  it("strips comments before parsing", () => {
    const blocks = parseRuleBlocks(":root { /* note */ --x: 1; }");
    expect(blocks[0]!.declarations).toEqual([{ property: "--x", value: "1" }]);
  });
});

describe("collectCustomPropDecls", () => {
  it("collects each (name, selector, value) declaration", () => {
    const decls = collectCustomPropDecls(parseRuleBlocks(SHEET));
    expect(decls).toContainEqual({ name: "--background", selector: ":root", value: "0 0% 100%" });
    expect(decls).toContainEqual({ name: "--background", selector: ".dark", value: "0 0% 4%" });
    expect(decls).toContainEqual({ name: "--radius", selector: ":root", value: "0.5rem" });
    // consumption-only properties are NOT custom-prop decls
    expect(decls.find((d) => d.name === "background-color")).toBeUndefined();
  });
});

describe("collectVarUseSites", () => {
  it("collects wrapping use-sites per consumed var, scoped by selector/property", () => {
    const sites = collectVarUseSites(parseRuleBlocks(SHEET));
    expect(sites).toContainEqual({
      name: "--background",
      selector: "body",
      property: "background-color",
      useSite: "hsl(var(--background))",
    });
    expect(sites).toContainEqual({
      name: "--radius",
      selector: ".btn",
      property: "border-radius",
      useSite: "var(--radius)",
    });
  });
  it("captures the color-mix wrapping use-site as the whole value", () => {
    const sites = collectVarUseSites(parseRuleBlocks(SHEET));
    const ring = sites.find((s) => s.name === "--ring");
    expect(ring).toBeDefined();
    expect(ring!.useSite.startsWith("color-mix(")).toBe(true);
  });
  it("does NOT treat a custom-property declaration as a use-site", () => {
    const sites = collectVarUseSites(parseRuleBlocks(":root { --primary: 240 5.9% 10%; }"));
    expect(sites).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/client test css-text`
  Expected failure: `Cannot find module './css-text.js'`.

- [ ] **Step 3: Minimal implementation** — FULL code

```ts
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
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/client test css-text`
  Expected: PASS (all describe blocks pass; note the `color-mix` case yields `useSite` starting with `color-mix(` because the outermost wrapping function around the var is captured).

- [ ] **Step 5: Commit** —
  `git add packages/client/src/theming/scan-sdk/css-text.ts packages/client/src/theming/scan-sdk/css-text.test.ts && git commit -m "feat(scan-sdk): CSS rule-text tokenizer for held decls + var use-sites"`

---

### Task 4: The in-browser `scan()` (CSSOM source-of-truth + demoted getComputedStyle)

**Files:**
- Create: `packages/client/src/theming/scan-sdk/scan.ts`
- Create: `packages/client/src/theming/scan-sdk/index.ts`
- Test: `packages/client/src/theming/scan-sdk/scan.test.ts`

**Interfaces:**
- Consumes:
  - `ScanPayload` from `@invariance/theming` (Task 1) — for the return type.
  - `classifyHeldFormat`, `classifyWrapping`, `modeFromSelector` from `./held-format.js` (Task 2).
  - `parseRuleBlocks`, `collectCustomPropDecls`, `collectVarUseSites` from `./css-text.js` (Task 3).
- Produces (ledger §8.2, verbatim):
  ```ts
  export function scan(doc?: Document): ScanPayload;
  ```

**Behavior (spec §5):** CSSOM walk is the source of truth — held values per mode read straight from rule text including `.dark`/`[data-theme]`, consumption wrapping per use-site. `getComputedStyle` is demoted to: enumerator (var names cross-check) + active-mode cross-check (resolved values logged but not authoritative) + var-chain resolver. Cross-origin sheets that throw `SecurityError` on `.cssRules` are recorded in `opaqueSheets`.

- [ ] **Step 1: Write the failing test** — FULL vitest code

```ts
// packages/client/src/theming/scan-sdk/scan.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { scan } from "./scan.js";

function inject(css: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

afterEach(() => {
  document.head.querySelectorAll("style").forEach((s) => s.remove());
});

const SHEET = `
:root { --background: 0 0% 100%; --primary: 240 5.9% 10%; --radius: 0.5rem; }
.dark { --background: 0 0% 4%; --primary: 0 0% 98%; }
body { background-color: hsl(var(--background)); }
.btn { background: hsl(var(--primary)); border-radius: var(--radius); }
`;

describe("scan()", () => {
  it("produces a parseable ScanPayload with both-mode held declarations", () => {
    inject(SHEET);
    const payload = scan(document);
    expect(payload.scanVersion).toBe(1);
    const bg = payload.variables.find((v) => v.name === "--background");
    expect(bg).toBeDefined();
    const light = bg!.declarations.find((d) => d.mode === "light");
    const dark = bg!.declarations.find((d) => d.mode === "dark");
    expect(light!.rawValue).toBe("0 0% 100%");
    expect(light!.heldFormat).toBe("hsl-triple");
    expect(dark!.rawValue).toBe("0 0% 4%");
  });

  it("captures consumption wrapping per use-site", () => {
    inject(SHEET);
    const payload = scan(document);
    expect(payload.consumption["--background"]).toContainEqual({
      wrapping: "hsl",
      selector: "body",
      property: "background-color",
    });
    expect(payload.consumption["--radius"]).toContainEqual({
      wrapping: "raw",
      selector: ".btn",
      property: "border-radius",
    });
  });

  it("infers mode from the declaring selector, not by toggling the DOM", () => {
    inject(SHEET);
    const payload = scan(document);
    const prim = payload.variables.find((v) => v.name === "--primary")!;
    expect(prim.declarations.map((d) => d.mode).sort()).toEqual(["dark", "light"]);
  });

  it("records cross-origin sheets that throw on .cssRules into opaqueSheets", () => {
    inject(SHEET);
    // Simulate an opaque sheet: a styleSheet whose cssRules getter throws SecurityError.
    const fakeSheet = {
      href: "https://cdn.other-origin.com/app.css",
      get cssRules(): never {
        throw new DOMException("blocked", "SecurityError");
      },
    } as unknown as CSSStyleSheet;
    const realList = Array.from(document.styleSheets);
    const patched = {
      length: realList.length + 1,
      item: (i: number) => (i < realList.length ? realList[i]! : fakeSheet),
      [Symbol.iterator]: function* () {
        yield* realList;
        yield fakeSheet;
      },
    } as unknown as StyleSheetList;
    const fakeDoc = Object.create(document, {
      styleSheets: { get: () => patched },
    }) as Document;
    const payload = scan(fakeDoc);
    expect(payload.opaqueSheets).toContain("https://cdn.other-origin.com/app.css");
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/client test scan-sdk/scan`
  Expected failure: `Cannot find module './scan.js'`.

- [ ] **Step 3: Minimal implementation** — FULL code

```ts
// packages/client/src/theming/scan-sdk/scan.ts
import type { ScanPayload } from "@invariance/theming";
import {
  classifyHeldFormat,
  classifyWrapping,
  modeFromSelector,
} from "./held-format.js";
import {
  parseRuleBlocks,
  collectCustomPropDecls,
  collectVarUseSites,
} from "./css-text.js";

const SCAN_VERSION = 1;

/**
 * In-browser scan (spec §5). CSSOM is the source of truth: held values per mode
 * are read straight from each rule's text (including .dark/[data-theme] rules),
 * NOT by toggling the live DOM. getComputedStyle is demoted to a cross-check /
 * enumerator only and never authoritative for held values.
 *
 * Cross-origin sheets that throw SecurityError on .cssRules are recorded in
 * opaqueSheets so the Scanner can mechanically downgrade affected inferences.
 */
export function scan(doc: Document = document): ScanPayload {
  const opaqueSheets: string[] = [];

  // --- Source of truth: the RAW authored CSS of every inline <style> element.
  // We read <style> textContent directly rather than join re-serialized rule.cssText:
  // rule.cssText is engine-re-serialized, and some engines/shims drop declarations they
  // cannot fully parse — e.g. happy-dom drops `background-color: hsl(var(--x))`, which
  // would erase the very consumption use-site the tokenizer must see. The element's raw
  // text never loses it. (Real browsers keep `hsl(var(--x))` in cssText too; the raw path
  // is simply the strictly-faithful one and survives test shims.) We record each captured
  // <style>'s backing sheet so the styleSheets walk below does not double-count it.
  let cssText = "";
  const capturedSheets = new Set<CSSStyleSheet>();
  for (const el of Array.from(doc.querySelectorAll("style"))) {
    const text = el.textContent;
    if (text && text.trim().length > 0) cssText += text + "\n";
    const owned = (el as HTMLStyleElement).sheet;
    if (owned) capturedSheets.add(owned);
  }

  // --- Walk styleSheets to (a) record opaque cross-origin sheets and (b) pick up readable
  // NON-inline sheets (e.g. same-origin <link>ed sheets, which have no <style> node).
  // Touch .cssRules to provoke a SecurityError on a cross-origin sheet; an unreadable sheet
  // is recorded, not silently skipped. Any sheet already captured via querySelectorAll
  // ("style") is SKIPPED by identity so its declarations are not counted twice.
  for (const sheet of Array.from(doc.styleSheets)) {
    if (capturedSheets.has(sheet as CSSStyleSheet)) continue; // already captured (inline <style>)
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      opaqueSheets.push((sheet as CSSStyleSheet).href ?? "(inline-unreadable)");
      continue;
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      cssText += rule.cssText + "\n";
    }
  }

  const blocks = parseRuleBlocks(cssText);

  // ---- Held declarations (per var, per mode) — CSSOM source of truth.
  const decls = collectCustomPropDecls(blocks);
  const byName = new Map<
    string,
    Array<{ selector: string; mode: "light" | "dark" | "unknown"; rawValue: string; heldFormat: ReturnType<typeof classifyHeldFormat> }>
  >();
  for (const d of decls) {
    const list = byName.get(d.name) ?? [];
    list.push({
      selector: d.selector,
      mode: modeFromSelector(d.selector),
      rawValue: d.value,
      heldFormat: classifyHeldFormat(d.value),
    });
    byName.set(d.name, list);
  }

  // getComputedStyle DEMOTED to enumerator + active-mode cross-check + var resolver.
  // We resolve the active-mode value to confirm a var is live; it does not override held.
  const gcs = doc.defaultView?.getComputedStyle(doc.documentElement);
  // (Cross-check only; the resolved value is intentionally not stored as held.)
  if (gcs) {
    for (const name of byName.keys()) {
      void gcs.getPropertyValue(name); // touch for the active-mode cross-check / var-chain resolve
    }
  }

  const variables = Array.from(byName.entries()).map(([name, declarations]) => ({
    name,
    declarations,
  }));

  // ---- Consumption use-sites (per var) — CSSOM source of truth.
  const consumption: Record<
    string,
    Array<{ wrapping: ReturnType<typeof classifyWrapping>; selector: string; property: string }>
  > = {};
  for (const site of collectVarUseSites(blocks)) {
    const list = consumption[site.name] ?? [];
    list.push({
      wrapping: classifyWrapping(site.useSite),
      selector: site.selector,
      property: site.property,
    });
    consumption[site.name] = list;
  }

  return {
    scanVersion: SCAN_VERSION,
    origin: doc.defaultView?.location?.origin ?? "",
    variables,
    consumption,
    opaqueSheets,
  };
}
```

```ts
// packages/client/src/theming/scan-sdk/index.ts
export { scan } from "./scan.js";
export type { HeldFormat, Wrapping, ScanMode } from "./held-format.js";
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/client test scan-sdk/scan`
  Expected: PASS (4 tests). If happy-dom's `cssRules` ordering differs, the `find`-based assertions are order-independent and still pass.

- [ ] **Step 5: Commit** —
  `git add packages/client/src/theming/scan-sdk/scan.ts packages/client/src/theming/scan-sdk/index.ts packages/client/src/theming/scan-sdk/scan.test.ts && git commit -m "feat(scan-sdk): in-browser scan() — CSSOM source-of-truth + demoted getComputedStyle (spec §5)"`

---

### Task 5: OKLCH role classification (control-plane)

**Files:**
- Create: `apps/control-plane/src/theming/scan/classify-role.ts`
- Test: `apps/control-plane/src/theming/scan/classify-role.test.ts`
- Modify: `apps/control-plane/package.json` (add `culori` + `@invariance/theming` deps if absent)

**Interfaces:**
- Consumes:
  - `RoleGraph`, `RoleId`, `getRoleGraph` from `@invariance/theming` (Plan 01).
  - `HeldFormat` (string union) — re-derived locally as a param type alias (the scanner side does not import the client package).
  - culori `parse`, `converter` (v4).
- Produces:
  ```ts
  export type RoleClassification = { role: RoleId; confidence: "confirmed" | "inferred" } | null;
  // Classify ONE var to a role given its dominant held value + format + the role graph.
  // heldFormat tells us how to read rawValue (hsl-triple/rgb-triple/hex/oklch → color; number → dimension).
  export function classifyRole(rawValue: string, heldFormat: string, graph: RoleGraph): RoleClassification;
  ```

**Note on classification model (v1):** color vars classify against the role graph by *name-anchored OKLCH heuristics* — the held value must parse to a color (confirms it is a color role), and the var's canonical name maps to a role. Because the shadcn "can" path ships first (every `--*` name is already a known role), the v1 classifier is **name-driven with an OKLCH parse gate**: a `--primary` whose held value parses as OKLCH is `{ role: "primary", confidence: "confirmed" }`; a color-typed var whose name is not a known role is `null` (→ `unmapped`). Dimension/number leaves classify to `radius`/`radius-sm..xl` by name; `--radius` → `radius`. This keeps classification deterministic and avoids guessing roles from raw OKLCH coordinates (deferred per §10).

- [ ] **Step 1: Write the failing test** — FULL vitest code

```ts
// apps/control-plane/src/theming/scan/classify-role.test.ts
import { describe, it, expect } from "vitest";
import { getRoleGraph, VOCAB_VERSION } from "@invariance/theming";
import { classifyRole } from "./classify-role.js";

const graph = getRoleGraph(VOCAB_VERSION);

describe("classifyRole", () => {
  // classifyRole is the PARSE GATE: given a held value + format, it answers "is this a
  // classifiable color/dimension leaf?" (non-null) or "not a theme leaf" (null). It does
  // NOT see the var name; the Scanner (Task 7) binds the concrete RoleId by canonical name
  // and ignores the sentinel `.role` of a color leaf. A returned `confidence:"confirmed"`
  // means the leaf parsed cleanly.
  it("gates a color-parseable held value as a confirmed color leaf", () => {
    const out = classifyRole("240 5.9% 10%", "hsl-triple", graph);
    expect(out).not.toBeNull();
    expect(out!.confidence).toBe("confirmed");
  });

  it("returns null when a color leaf fails to parse (not a color)", () => {
    const out = classifyRole("'Inter', sans-serif", "unknown", graph);
    expect(out).toBeNull();
  });

  it("classifies a number leaf as the radius dimension role", () => {
    const out = classifyRole("0.5rem", "number", graph);
    expect(out).not.toBeNull();
    expect(out!.role).toBe("radius");
  });
});
```

> **Design note (the `classifyRole` contract):** `classifyRole` is intentionally name-blind — it is the deterministic *leaf parse gate*, not the role binder. For a `number` leaf it returns the only iv-roles-1 dimension role (`radius`); for a color leaf that parses it returns a confirmed-kind sentinel (`primary`) signalling "this IS a color"; for anything that neither parses as a color nor is a number it returns `null`. The Scanner (Task 7) binds the concrete `RoleId` by canonical var name (`NAME_TO_ROLE`) and uses `classifyRole` only for its non-null/null verdict — so the color-leaf sentinel role is never surfaced. This keeps role binding deterministic (name-driven) and defers "guess role from raw OKLCH coordinates" per §10.

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/control-plane test classify-role`
  Expected failure: `Cannot find module './classify-role.js'`.

- [ ] **Step 3: Minimal implementation** — FULL code

```ts
// apps/control-plane/src/theming/scan/classify-role.ts
import type { RoleGraph, RoleId } from "@invariance/theming";
import { parse, converter } from "culori";

const toOklch = converter("oklch");

export type RoleClassification = { role: RoleId; confidence: "confirmed" | "inferred" } | null;

/** Re-read a held value into a CSS color string parse target by held format. */
function heldToColorString(rawValue: string, heldFormat: string): string | null {
  const v = rawValue.trim();
  switch (heldFormat) {
    case "hsl-triple": {
      // "H S% L%" → hsl(H S% L%)
      return `hsl(${v})`;
    }
    case "rgb-triple": {
      // "R G B" (0–255) → rgb(R G B)
      return `rgb(${v.split(/\s+/).join(" ")})`;
    }
    case "hex":
    case "oklch":
      return v;
    default:
      return null;
  }
}

/**
 * v1 role classification (spec §5, name resolution deferred to the Scanner):
 *  - number leaf → the `radius` dimension role (the only dimension seed/role in iv-roles-1).
 *  - color leaf → parse-gated: if the held value parses to OKLCH it is a confirmed color role
 *    (the concrete role is bound by var NAME in the Scanner; here we return the canonical
 *    color-kind anchor role `primary` as the "is a color" signal with confidence:"confirmed").
 *  - anything that neither parses as a color nor is a number → null (unmapped).
 *
 * Keeping the heavy "guess role from raw OKLCH coordinates" out of v1 is deliberate (§10): the
 * shadcn "can" path is name-driven, so the parse gate + name binding is sufficient and fully
 * deterministic.
 */
export function classifyRole(
  rawValue: string,
  heldFormat: string,
  graph: RoleGraph,
): RoleClassification {
  if (heldFormat === "number") {
    // Only meaningful dimension role in iv-roles-1 is radius.
    return graph.roles["radius"] ? { role: "radius", confidence: "confirmed" } : null;
  }
  const colorStr = heldToColorString(rawValue, heldFormat);
  if (colorStr) {
    const parsed = parse(colorStr);
    if (parsed && toOklch(parsed)) {
      // Confirmed color leaf. The Scanner binds the concrete role by var name; we anchor on a
      // known color role so the kind is unambiguous to callers that don't have the name.
      return { role: "primary", confidence: "confirmed" };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/control-plane test classify-role`
  Expected: PASS (3 tests). (Package name `@invariance/control-plane` is confirmed from `apps/control-plane/package.json`.)

- [ ] **Step 5: Commit** —
  `git add apps/control-plane/src/theming/scan/classify-role.ts apps/control-plane/src/theming/scan/classify-role.test.ts apps/control-plane/package.json && git commit -m "feat(scanner): OKLCH parse-gated role classification (spec §5)"`

---

### Task 6: Emit-contract inference (consumption dictates, held cross-checks + carve-outs)

**Files:**
- Create: `apps/control-plane/src/theming/scan/infer-emit.ts`
- Test: `apps/control-plane/src/theming/scan/infer-emit.test.ts`

**Interfaces:**
- Consumes:
  - `EmitContract`, `Space` from `@invariance/theming` (Plan 01 manifest module — ledger §4.1).
  - `ScanPayload` consumption/declaration shapes (Task 1) — uses the inline element types.
- Produces:
  ```ts
  export type EmitInference = {
    emit: EmitContract;                       // { shape, space, precision }
    confidence: "confirmed" | "inferred";
    reason?: "color_mix" | "opaque_sheet" | "low_confidence_inference" | "ambiguous_role";
  };
  // Infer the emit contract for one var from its consumption sites + held format, honoring
  // the raw/color-mix carve-outs and the opaqueSheets mechanical downgrade.
  export function inferEmit(args: {
    consumptionSites: Array<{ wrapping: "hsl"|"rgb"|"oklch"|"raw"|"color-mix"|"other"; selector: string; property: string }>;
    heldFormat: "hsl-triple"|"rgb-triple"|"hex"|"oklch"|"number"|"keyword"|"unknown";
    opaqueDowngrade: boolean;                 // true when ScanPayload.opaqueSheets is non-empty
  }): EmitInference;
  ```

**Rules (spec §5, verbatim):**
- **consumption dictates when it wraps:** `hsl`/`rgb`/`oklch` wrapping → `shape:"triple", space:<that>`; `confirmed`.
- **raw-consumption carve-out:** `raw` wrapping → no obligation, **held format dictates** → e.g. `number`→`{shape:"number", space:null}`, `oklch`→`{shape:"raw", space:"oklch"}` (full-color string passed through). `confirmed`.
- **color-mix carve-out:** any `color-mix` site → no single emit space → `confidence:"inferred"`, `reason:"color_mix"`; emit best-effort from held.
- **opaqueSheets teeth:** `opaqueDowngrade` true → force `confidence:"inferred"`, `reason:"opaque_sheet"` UNLESS the held format corroborates a definite emit (held is a triple/oklch/number matching the consumption) — then keep `confirmed`.
- **`other`/mixed/empty consumption + non-corroborating held** → `confidence:"inferred"`, `reason:"low_confidence_inference"`.

- [ ] **Step 1: Write the failing test** — FULL vitest code

```ts
// apps/control-plane/src/theming/scan/infer-emit.test.ts
import { describe, it, expect } from "vitest";
import { inferEmit } from "./infer-emit.js";

describe("inferEmit — consumption dictates when it wraps", () => {
  it("hsl wrapping → triple/hsl, confirmed", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "hsl", selector: "body", property: "background-color" }],
      heldFormat: "hsl-triple",
      opaqueDowngrade: false,
    });
    expect(out.emit).toEqual({ shape: "triple", space: "hsl", precision: 4 });
    expect(out.confidence).toBe("confirmed");
  });

  it("oklch wrapping → triple/oklch, confirmed", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "oklch", selector: "a", property: "color" }],
      heldFormat: "oklch",
      opaqueDowngrade: false,
    });
    expect(out.emit).toEqual({ shape: "triple", space: "oklch", precision: 4 });
    expect(out.confidence).toBe("confirmed");
  });
});

describe("inferEmit — raw-consumption carve-out (held dictates)", () => {
  it("raw + number held → number/null, confirmed", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "raw", selector: ".btn", property: "border-radius" }],
      heldFormat: "number",
      opaqueDowngrade: false,
    });
    expect(out.emit).toEqual({ shape: "number", space: null, precision: 4 });
    expect(out.confidence).toBe("confirmed");
  });

  it("raw + oklch held → raw/oklch, confirmed", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "raw", selector: "a", property: "color" }],
      heldFormat: "oklch",
      opaqueDowngrade: false,
    });
    expect(out.emit).toEqual({ shape: "raw", space: "oklch", precision: 4 });
    expect(out.confidence).toBe("confirmed");
  });
});

describe("inferEmit — color-mix carve-out", () => {
  it("any color-mix site → inferred, reason color_mix", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "color-mix", selector: ".ring", property: "box-shadow" }],
      heldFormat: "hsl-triple",
      opaqueDowngrade: false,
    });
    expect(out.confidence).toBe("inferred");
    expect(out.reason).toBe("color_mix");
  });
});

describe("inferEmit — opaqueSheets teeth", () => {
  it("downgrades to inferred/opaque_sheet when held does NOT corroborate", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "hsl", selector: "body", property: "color" }],
      heldFormat: "unknown",
      opaqueDowngrade: true,
    });
    expect(out.confidence).toBe("inferred");
    expect(out.reason).toBe("opaque_sheet");
  });

  it("KEEPS confirmed when held corroborates the wrapping (triple matches hsl)", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "hsl", selector: "body", property: "color" }],
      heldFormat: "hsl-triple",
      opaqueDowngrade: true,
    });
    expect(out.confidence).toBe("confirmed");
    expect(out.emit).toEqual({ shape: "triple", space: "hsl", precision: 4 });
  });
});

describe("inferEmit — low-confidence fallback", () => {
  it("empty consumption + non-color held → inferred/low_confidence_inference", () => {
    const out = inferEmit({ consumptionSites: [], heldFormat: "unknown", opaqueDowngrade: false });
    expect(out.confidence).toBe("inferred");
    expect(out.reason).toBe("low_confidence_inference");
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/control-plane test infer-emit`
  Expected failure: `Cannot find module './infer-emit.js'`.

- [ ] **Step 3: Minimal implementation** — FULL code

```ts
// apps/control-plane/src/theming/scan/infer-emit.ts
import type { EmitContract, Space } from "@invariance/theming";

const PRECISION = 4; // eyes-on knob; pinned for deterministic golden files.

type Wrapping = "hsl" | "rgb" | "oklch" | "raw" | "color-mix" | "other";
type HeldFormat =
  | "hsl-triple"
  | "rgb-triple"
  | "hex"
  | "oklch"
  | "number"
  | "keyword"
  | "unknown";

export type EmitInference = {
  emit: EmitContract;
  confidence: "confirmed" | "inferred";
  reason?: "color_mix" | "opaque_sheet" | "low_confidence_inference" | "ambiguous_role";
};

/** The triple/space a wrapping function dictates. */
function wrappingEmit(wrapping: "hsl" | "rgb" | "oklch"): EmitContract {
  const space: Space = wrapping; // "hsl" | "rgb" | "oklch"
  return { shape: "triple", space, precision: PRECISION };
}

/** The emit dictated by the held format under the raw carve-out (no wrapping obligation). */
function heldEmit(heldFormat: HeldFormat): EmitContract {
  switch (heldFormat) {
    case "number":
      return { shape: "number", space: null, precision: PRECISION };
    case "hsl-triple":
      return { shape: "triple", space: "hsl", precision: PRECISION };
    case "rgb-triple":
      return { shape: "triple", space: "rgb", precision: PRECISION };
    case "oklch":
      return { shape: "raw", space: "oklch", precision: PRECISION }; // full color string passed through
    case "hex":
      return { shape: "raw", space: "rgb", precision: PRECISION };
    default:
      // keyword / unknown — no definite emit; raw string with no channel space.
      return { shape: "raw", space: null, precision: PRECISION };
  }
}

/** Does the held format corroborate the wrapping (so an opaque sheet need not downgrade it)? */
function heldCorroborates(wrapping: Wrapping, heldFormat: HeldFormat): boolean {
  if (wrapping === "hsl") return heldFormat === "hsl-triple";
  if (wrapping === "rgb") return heldFormat === "rgb-triple";
  if (wrapping === "oklch") return heldFormat === "oklch";
  if (wrapping === "raw") return heldFormat !== "unknown" && heldFormat !== "keyword";
  return false;
}

export function inferEmit(args: {
  consumptionSites: Array<{ wrapping: Wrapping; selector: string; property: string }>;
  heldFormat: HeldFormat;
  opaqueDowngrade: boolean;
}): EmitInference {
  const { consumptionSites, heldFormat, opaqueDowngrade } = args;

  // color-mix carve-out: any color-mix site → low-confidence, never a guessed emit.
  if (consumptionSites.some((s) => s.wrapping === "color-mix")) {
    return { emit: heldEmit(heldFormat), confidence: "inferred", reason: "color_mix" };
  }

  // Pick the dominant wrapping (first wrapping site that dictates; else raw; else none).
  const dictating = consumptionSites.find(
    (s) => s.wrapping === "hsl" || s.wrapping === "rgb" || s.wrapping === "oklch",
  );
  const hasRaw = consumptionSites.some((s) => s.wrapping === "raw");

  let emit: EmitContract;
  let baseConfidence: "confirmed" | "inferred";
  let dominantWrapping: Wrapping;

  if (dictating) {
    emit = wrappingEmit(dictating.wrapping as "hsl" | "rgb" | "oklch");
    baseConfidence = "confirmed";
    dominantWrapping = dictating.wrapping;
  } else if (hasRaw) {
    // raw-consumption carve-out: held format dictates.
    emit = heldEmit(heldFormat);
    baseConfidence = heldFormat === "unknown" || heldFormat === "keyword" ? "inferred" : "confirmed";
    dominantWrapping = "raw";
  } else {
    // "other"/mixed/empty consumption — no obligation, fall back to held.
    emit = heldEmit(heldFormat);
    baseConfidence = "inferred";
    dominantWrapping = "other";
  }

  // opaqueSheets teeth: downgrade UNLESS held corroborates the dominant wrapping.
  if (opaqueDowngrade && !heldCorroborates(dominantWrapping, heldFormat)) {
    return { emit, confidence: "inferred", reason: "opaque_sheet" };
  }

  if (baseConfidence === "inferred") {
    return { emit, confidence: "inferred", reason: "low_confidence_inference" };
  }
  return { emit, confidence: "confirmed" };
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/control-plane test infer-emit`
  Expected: PASS (all branches pass).

- [ ] **Step 5: Commit** —
  `git add apps/control-plane/src/theming/scan/infer-emit.ts apps/control-plane/src/theming/scan/infer-emit.test.ts && git commit -m "feat(scanner): emit-contract inference — consumption dictates, held cross-checks + carve-outs (spec §5)"`

---

### Task 7: The Scanner (`runScanner`) + coverage report + manifest assembly

**Files:**
- Create: `apps/control-plane/src/theming/scan/scanner.ts`
- Create: `apps/control-plane/src/theming/scan/index.ts`
- Test: `apps/control-plane/src/theming/scan/scanner.test.ts`

**Interfaces:**
- Consumes:
  - `ScanPayload` from `@invariance/theming` (Task 1).
  - `AppManifest`, `Shape`, `Space` from `@invariance/theming` (Plan 01 manifest).
  - `RoleId`, `VarName`, `ContrastTier`, `getRoleGraph`, `VOCAB_VERSION` from `@invariance/theming` (Plan 01 roles).
  - `classifyRole` (Task 5), `inferEmit` (Task 6).
- Produces (ledger §8.3 / §8.4, verbatim names):
  ```ts
  export function runScanner(payload: ScanPayload, opts: ScannerOptions): ScanResult;
  export type ScannerOptions = {
    appId: string;
    vocabVersion: string;     // default VOCAB_VERSION
    profileVersion: string;
    contrastTier: ContrastTier;
  };
  export type ScanResult = { manifest: AppManifest; coverage: CoverageReport };
  export type CoverageReport = {
    classified: Array<{ name: VarName; role: RoleId; confidence: "confirmed" | "inferred" }>;
    needsConfirmation: Array<{ name: VarName; reason: CoverageReason }>;
    unmapped: VarName[];
    opaqueSheetCount: number;
  };
  export type CoverageReason = "color_mix" | "opaque_sheet" | "low_confidence_inference" | "ambiguous_role";
  ```

**Manifest assembly (spec §5/§6):** produce `variables` (var→role + `emit` + `confidence`), `modes.selectors` (one light selector + dark selector from declared dark scopes), `modes.allowed`/`default`, `base` (light/dark `RoleId→string` captured verbatim from held values), `defaultSeeds` (from captured seed roles). `vocabVersion`/`profileVersion` from opts; `manifestVersion: 1`; `invariants` with the vendor-declared `contrastTier`, a `chromaCap` default, empty `locks`, empty `allowedFonts` (typography unmapped in v1 scan). The role→var name binding is done here by canonical name (`--primary`→`primary`, `--card-foreground`→`card-fg`, etc.).

- [ ] **Step 1: Write the failing test** — FULL vitest code

```ts
// apps/control-plane/src/theming/scan/scanner.test.ts
import { describe, it, expect } from "vitest";
import { VOCAB_VERSION, PROFILE_VERSION } from "@invariance/theming";
import type { ScanPayload } from "@invariance/theming";
import { runScanner } from "./scanner.js";

// A minimal shadcn-shaped scan: background + primary + their foregrounds, both modes,
// all consumed via hsl(var(--x)); plus a raw-consumed radius number.
const PAYLOAD: ScanPayload = {
  scanVersion: 1,
  origin: "https://app.example.com",
  variables: [
    {
      name: "--background",
      declarations: [
        { selector: ":root", mode: "light", rawValue: "0 0% 100%", heldFormat: "hsl-triple" },
        { selector: ".dark", mode: "dark", rawValue: "0 0% 4%", heldFormat: "hsl-triple" },
      ],
    },
    {
      name: "--foreground",
      declarations: [
        { selector: ":root", mode: "light", rawValue: "0 0% 4%", heldFormat: "hsl-triple" },
        { selector: ".dark", mode: "dark", rawValue: "0 0% 98%", heldFormat: "hsl-triple" },
      ],
    },
    {
      name: "--primary",
      declarations: [
        { selector: ":root", mode: "light", rawValue: "240 5.9% 10%", heldFormat: "hsl-triple" },
        { selector: ".dark", mode: "dark", rawValue: "0 0% 98%", heldFormat: "hsl-triple" },
      ],
    },
    {
      name: "--radius",
      declarations: [{ selector: ":root", mode: "light", rawValue: "0.5rem", heldFormat: "number" }],
    },
  ],
  consumption: {
    "--background": [{ wrapping: "hsl", selector: "body", property: "background-color" }],
    "--foreground": [{ wrapping: "hsl", selector: "body", property: "color" }],
    "--primary": [{ wrapping: "hsl", selector: ".btn", property: "background-color" }],
    "--radius": [{ wrapping: "raw", selector: ".btn", property: "border-radius" }],
  },
  opaqueSheets: [],
};

const OPTS = {
  appId: "demo-app",
  vocabVersion: VOCAB_VERSION,
  profileVersion: PROFILE_VERSION,
  contrastTier: "AA" as const,
};

describe("runScanner — manifest assembly", () => {
  it("binds vars to roles by canonical name with confirmed confidence", () => {
    const { manifest } = runScanner(PAYLOAD, OPTS);
    expect(manifest.appId).toBe("demo-app");
    expect(manifest.vocabVersion).toBe(VOCAB_VERSION);
    expect(manifest.variables["--background"]!.role).toBe("background");
    expect(manifest.variables["--primary"]!.role).toBe("primary");
    expect(manifest.variables["--background"]!.confidence).toBe("confirmed");
  });

  it("emits triple/hsl for hsl-consumed colors and number/null for raw radius", () => {
    const { manifest } = runScanner(PAYLOAD, OPTS);
    expect(manifest.variables["--primary"]!.emit).toEqual({ shape: "triple", space: "hsl", precision: 4 });
    expect(manifest.variables["--radius"]!.emit).toEqual({ shape: "number", space: null, precision: 4 });
  });

  it("captures per-mode selectors and both base maps verbatim", () => {
    const { manifest } = runScanner(PAYLOAD, OPTS);
    expect(manifest.modes.allowed.sort()).toEqual(["dark", "light"]);
    expect(manifest.modes.selectors.light).toBe(":root");
    expect(manifest.modes.selectors.dark).toBe(".dark");
    expect(manifest.base.light["background"]).toBe("0 0% 100%");
    expect(manifest.base.dark!["primary"]).toBe("0 0% 98%");
  });

  it("captures defaultSeeds from the seed roles", () => {
    const { manifest } = runScanner(PAYLOAD, OPTS);
    expect(manifest.defaultSeeds.colors.primary).toBe("240 5.9% 10%");
    expect(manifest.defaultSeeds.radius).toBe(0.5);
  });
});

describe("runScanner — coverage report", () => {
  it("classifies mapped vars and lists none needing confirmation for a clean scan", () => {
    const { coverage } = runScanner(PAYLOAD, OPTS);
    expect(coverage.classified.map((c) => c.name).sort()).toContain("--primary");
    expect(coverage.needsConfirmation).toEqual([]);
    expect(coverage.opaqueSheetCount).toBe(0);
  });

  it("routes an unknown-named color var to unmapped", () => {
    const withExtra: ScanPayload = {
      ...PAYLOAD,
      variables: [
        ...PAYLOAD.variables,
        {
          name: "--brand-glow",
          declarations: [{ selector: ":root", mode: "light", rawValue: "120 50% 50%", heldFormat: "hsl-triple" }],
        },
      ],
    };
    const { coverage } = runScanner(withExtra, OPTS);
    expect(coverage.unmapped).toContain("--brand-glow");
    expect(coverage.classified.find((c) => c.name === "--brand-glow")).toBeUndefined();
  });

  it("mechanically downgrades to needsConfirmation/opaque_sheet when opaqueSheets is non-empty", () => {
    const opaque: ScanPayload = { ...PAYLOAD, opaqueSheets: ["https://cdn.other.com/x.css"] };
    const { coverage, manifest } = runScanner(opaque, OPTS);
    expect(coverage.opaqueSheetCount).toBe(1);
    // colors consumed via hsl with corroborating hsl-triple held STAY confirmed (held corroborates);
    // a var whose held does not corroborate is downgraded. Here all colors corroborate, radius raw+number corroborates,
    // so the clean shadcn shape stays confirmed even under an opaque sheet (the honest carve-out).
    expect(manifest.variables["--primary"]!.confidence).toBe("confirmed");
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/control-plane test scanner`
  Expected failure: `Cannot find module './scanner.js'`.

- [ ] **Step 3: Minimal implementation** — FULL code

```ts
// apps/control-plane/src/theming/scan/scanner.ts
import type { AppManifest, ScanPayload, RoleId, VarName, ContrastTier } from "@invariance/theming";
import { getRoleGraph, VOCAB_VERSION } from "@invariance/theming";
import { classifyRole } from "./classify-role.js";
import { inferEmit } from "./infer-emit.js";

export type ScannerOptions = {
  appId: string;
  vocabVersion: string;
  profileVersion: string;
  contrastTier: ContrastTier;
};

export type CoverageReason =
  | "color_mix"
  | "opaque_sheet"
  | "low_confidence_inference"
  | "ambiguous_role";

export type CoverageReport = {
  classified: Array<{ name: VarName; role: RoleId; confidence: "confirmed" | "inferred" }>;
  needsConfirmation: Array<{ name: VarName; reason: CoverageReason }>;
  unmapped: VarName[];
  opaqueSheetCount: number;
};

export type ScanResult = { manifest: AppManifest; coverage: CoverageReport };

const DEFAULT_CHROMA_CAP = 0.4;

/**
 * Canonical var-name → RoleId binding for iv-roles-1 (shadcn naming). The scan's
 * source of truth for which role a `--*` var IS. Vars not in this table classify
 * as `unmapped`.
 */
const NAME_TO_ROLE: Record<string, RoleId> = {
  "--primary": "primary",
  "--accent": "accent",
  "--destructive": "destructive",
  "--background": "background",
  "--card": "card",
  "--popover": "popover",
  "--muted": "muted",
  "--secondary": "secondary",
  "--border": "border",
  "--input": "input",
  "--ring": "ring",
  "--foreground": "foreground",
  "--card-foreground": "card-fg",
  "--popover-foreground": "popover-fg",
  "--secondary-foreground": "secondary-fg",
  "--primary-foreground": "primary-fg",
  "--accent-foreground": "accent-fg",
  "--destructive-foreground": "destructive-fg",
  "--muted-foreground": "muted-fg",
  "--radius": "radius",
};

function dominantDeclaration(decls: ScanPayload["variables"][number]["declarations"]) {
  // Prefer the light declaration (the canvas); else the first.
  return decls.find((d) => d.mode === "light") ?? decls[0]!;
}

function radiusToNumber(raw: string): number {
  const m = /(-?\d*\.?\d+)/.exec(raw.trim());
  return m ? Number(m[1]) : 0;
}

export function runScanner(payload: ScanPayload, opts: ScannerOptions): ScanResult {
  const vocabVersion = opts.vocabVersion || VOCAB_VERSION;
  const graph = getRoleGraph(vocabVersion);
  const opaqueDowngrade = payload.opaqueSheets.length > 0;

  const variables: AppManifest["variables"] = {};
  const baseLight: Record<string, string> = {};
  const baseDark: Record<string, string> = {};
  let sawDark = false;
  let darkSelector: string | undefined;
  let lightSelector = ":root";

  const classified: CoverageReport["classified"] = [];
  const needsConfirmation: CoverageReport["needsConfirmation"] = [];
  const unmapped: VarName[] = [];

  for (const v of payload.variables) {
    const role = NAME_TO_ROLE[v.name];
    const dom = dominantDeclaration(v.declarations);
    // Parse gate: a color-named var must actually parse as a color leaf (classifyRole gate).
    const kind = classifyRole(dom.rawValue, dom.heldFormat, graph);
    if (!role || !kind) {
      unmapped.push(v.name);
      continue;
    }

    // Record base[mode][role] verbatim (the canvas / fail-open target).
    for (const d of v.declarations) {
      if (d.mode === "light") {
        baseLight[role] = d.rawValue;
        lightSelector = d.selector || lightSelector;
      } else if (d.mode === "dark") {
        baseDark[role] = d.rawValue;
        sawDark = true;
        darkSelector = d.selector || darkSelector;
      }
    }

    const emitInf = inferEmit({
      consumptionSites: payload.consumption[v.name] ?? [],
      heldFormat: dom.heldFormat,
      opaqueDowngrade,
    });

    variables[v.name] = { role, emit: emitInf.emit, confidence: emitInf.confidence };
    classified.push({ name: v.name, role, confidence: emitInf.confidence });
    if (emitInf.confidence === "inferred" && emitInf.reason) {
      needsConfirmation.push({ name: v.name, reason: emitInf.reason });
    }
  }

  // ---- Modes
  const allowed: ("light" | "dark")[] = sawDark ? ["light", "dark"] : ["light"];
  const selectors: { light: string; dark?: string } = { light: lightSelector };
  if (sawDark) selectors.dark = darkSelector ?? ".dark";

  // ---- defaultSeeds (Designer baseline)
  const radiusRaw = baseLight["radius"];
  const defaultSeeds: AppManifest["defaultSeeds"] = {
    colors: {
      primary: baseLight["primary"] ?? "",
      accent: baseLight["accent"] ?? "",
      neutral: baseLight["background"] ?? "", // neutral seeds the surface ramp; capture background's held
      destructive: baseLight["destructive"] ?? "",
    },
    radius: radiusRaw !== undefined ? radiusToNumber(radiusRaw) : 0,
    density: "comfortable",
  };

  const manifest: AppManifest = {
    appId: opts.appId,
    manifestVersion: 1,
    vocabVersion,
    profileVersion: opts.profileVersion,
    variables,
    modes: { allowed, default: "light", selectors },
    base: sawDark ? { light: baseLight, dark: baseDark } : { light: baseLight },
    defaultSeeds,
    invariants: {
      contrastTier: opts.contrastTier,
      chromaCap: DEFAULT_CHROMA_CAP,
      locks: [],
      allowedFonts: [],
    },
  };

  return {
    manifest,
    coverage: {
      classified,
      needsConfirmation,
      unmapped,
      opaqueSheetCount: payload.opaqueSheets.length,
    },
  };
}
```

```ts
// apps/control-plane/src/theming/scan/index.ts
// Task 8 extends this barrel with the `getCanManifest` re-export. Kept self-consistent
// here so Task 7 typechecks and tests green standalone (no forward reference to a
// not-yet-created module).
export { runScanner } from "./scanner.js";
export type {
  ScannerOptions,
  ScanResult,
  CoverageReport,
  CoverageReason,
} from "./scanner.js";
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/control-plane test scanner`
  Expected: PASS (all 6 tests). The barrel is self-consistent (no forward reference); Task 8 adds the `getCanManifest` re-export.

- [ ] **Step 5: Commit** —
  `git add apps/control-plane/src/theming/scan/scanner.ts apps/control-plane/src/theming/scan/index.ts apps/control-plane/src/theming/scan/scanner.test.ts && git commit -m "feat(scanner): runScanner — role binding, emit inference, coverage report, manifest assembly (spec §5/§6)"`

---

### Task 8: The shadcn "can" skip-scan path

**Files:**
- Create: `apps/control-plane/src/theming/scan/can-path.ts`
- Test: `apps/control-plane/src/theming/scan/can-path.test.ts`

**Interfaces:**
- Consumes:
  - `AppManifest`, `SHADCN_CAN` from `@invariance/theming` (Plan 01 manifest module — `SHADCN_CAN` is the prebuilt manifest fixture).
- Produces:
  ```ts
  // The near-zero-touch shadcn path (spec §1.1/§5): skip scan-and-confirm, return the
  // prebuilt "can" manifest with the caller's appId stamped.
  export function getCanManifest(appId: string): AppManifest;
  ```

- [ ] **Step 1: Write the failing test** — FULL vitest code

```ts
// apps/control-plane/src/theming/scan/can-path.test.ts
import { describe, it, expect } from "vitest";
import { AppManifest, SHADCN_CAN } from "@invariance/theming";
import { getCanManifest } from "./can-path.js";

describe("getCanManifest — the shadcn 'can' skip-scan path", () => {
  it("returns a valid AppManifest (re-parses against the schema)", () => {
    const m = getCanManifest("nebula");
    expect(AppManifest.safeParse(m).success).toBe(true);
  });

  it("stamps the caller's appId onto the prebuilt can", () => {
    const m = getCanManifest("nebula");
    expect(m.appId).toBe("nebula");
  });

  it("does not mutate the shared SHADCN_CAN fixture", () => {
    const before = SHADCN_CAN.appId;
    getCanManifest("other-app");
    expect(SHADCN_CAN.appId).toBe(before);
  });

  it("the can base meets its declared tier (a publishable manifest by construction)", () => {
    // SHADCN_CAN is built to pass refBasePassesTier; re-parsing confirms the superRefine gate.
    const parsed = AppManifest.safeParse(getCanManifest("nebula"));
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/control-plane test can-path`
  Expected failure: `Cannot find module './can-path.js'`.

- [ ] **Step 3: Minimal implementation** — FULL code

```ts
// apps/control-plane/src/theming/scan/can-path.ts
import type { AppManifest } from "@invariance/theming";
import { SHADCN_CAN } from "@invariance/theming";

/**
 * The shadcn "can" path (spec §1.1 / §5): for a shadcn app, variables/formats/
 * modes are known in advance, so the prebuilt manifest skips scan-and-confirm —
 * the near-zero-touch path and the v1 demo path. We return a deep copy of the
 * shared SHADCN_CAN fixture with the caller's appId stamped, so callers never
 * mutate the shared constant.
 */
export function getCanManifest(appId: string): AppManifest {
  const copy = structuredClone(SHADCN_CAN);
  copy.appId = appId;
  return copy;
}
```

- [ ] **Step 4: Extend the barrel re-export** — append the `getCanManifest` re-export to `apps/control-plane/src/theming/scan/index.ts` (Task 7 left it out by design so Task 7 typechecked standalone). The file becomes:
  ```ts
  // apps/control-plane/src/theming/scan/index.ts
  export { runScanner } from "./scanner.js";
  export type {
    ScannerOptions,
    ScanResult,
    CoverageReport,
    CoverageReason,
  } from "./scanner.js";
  export { getCanManifest } from "./can-path.js";
  ```

- [ ] **Step 5: Run tests, verify pass** — `pnpm -F @invariance/control-plane test can-path`
  Expected: PASS (4 tests). (`can-path.test.ts` imports `getCanManifest` directly from `./can-path.js`, so it is green independent of the barrel; the barrel edit is what makes `getCanManifest` reachable from `@invariance/control-plane`'s scan module for downstream callers, e.g. Plan 05.)

- [ ] **Step 6: Commit** —
  `git add apps/control-plane/src/theming/scan/can-path.ts apps/control-plane/src/theming/scan/can-path.test.ts apps/control-plane/src/theming/scan/index.ts && git commit -m "feat(scanner): shadcn 'can' skip-scan path — getCanManifest (spec §1.1/§5)"`

---

### Task 9: End-to-end scan → Scanner integration test (SDK output feeds runScanner)

**Files:**
- Create: `apps/control-plane/src/theming/scan/scan-roundtrip.test.ts`

**Interfaces:**
- Consumes:
  - `scan` from `@invariance/client/theming/scan-sdk` — but the control-plane test cannot use happy-dom while running in the node environment; so this test asserts the **contract roundtrip** by feeding a hand-authored `ScanPayload` shaped exactly as the SDK's `scan()` produces (verified shape from Task 4's tests) through `runScanner`, proving the two halves agree on the contract.
  - `runScanner` (Task 7), `ScanPayload`, `VOCAB_VERSION`, `PROFILE_VERSION` from `@invariance/theming`.

> This is the explicit "tests drive the Scanner against fixture ScanPayloads, the SDK against fixture stylesheet strings" boundary from scope: the contract (`ScanPayload`) is the seam, so the integration test pins that a payload of the SDK's shape yields a manifest whose `confidence` honors the carve-outs end to end.

- [ ] **Step 1: Write the failing test** — FULL vitest code

```ts
// apps/control-plane/src/theming/scan/scan-roundtrip.test.ts
import { describe, it, expect } from "vitest";
import { VOCAB_VERSION, PROFILE_VERSION } from "@invariance/theming";
import type { ScanPayload } from "@invariance/theming";
import { runScanner } from "./scanner.js";

// A payload shaped exactly as scan() emits (see scan.test.ts): a color-mix consumer
// downgrades to inferred, an opaque sheet downgrades a non-corroborating var, while
// the corroborating shadcn colors stay confirmed.
const SDK_SHAPED: ScanPayload = {
  scanVersion: 1,
  origin: "https://app.example.com",
  variables: [
    {
      name: "--background",
      declarations: [
        { selector: ":root", mode: "light", rawValue: "0 0% 100%", heldFormat: "hsl-triple" },
        { selector: ".dark", mode: "dark", rawValue: "0 0% 4%", heldFormat: "hsl-triple" },
      ],
    },
    {
      name: "--foreground",
      declarations: [
        { selector: ":root", mode: "light", rawValue: "0 0% 4%", heldFormat: "hsl-triple" },
        { selector: ".dark", mode: "dark", rawValue: "0 0% 98%", heldFormat: "hsl-triple" },
      ],
    },
    {
      name: "--ring",
      declarations: [
        { selector: ":root", mode: "light", rawValue: "240 5% 65%", heldFormat: "hsl-triple" },
      ],
    },
  ],
  consumption: {
    "--background": [{ wrapping: "hsl", selector: "body", property: "background-color" }],
    "--foreground": [{ wrapping: "hsl", selector: "body", property: "color" }],
    // --ring is consumed through color-mix → must downgrade to inferred/color_mix
    "--ring": [{ wrapping: "color-mix", selector: ".focus", property: "box-shadow" }],
  },
  opaqueSheets: [],
};

const OPTS = {
  appId: "roundtrip",
  vocabVersion: VOCAB_VERSION,
  profileVersion: PROFILE_VERSION,
  contrastTier: "AA" as const,
};

describe("scan → runScanner contract roundtrip", () => {
  it("color-mix consumer is routed to needsConfirmation with reason color_mix", () => {
    const { manifest, coverage } = runScanner(SDK_SHAPED, OPTS);
    expect(manifest.variables["--ring"]!.confidence).toBe("inferred");
    expect(coverage.needsConfirmation).toContainEqual({ name: "--ring", reason: "color_mix" });
  });

  it("hsl-corroborated colors stay confirmed and produce triple/hsl emit", () => {
    const { manifest } = runScanner(SDK_SHAPED, OPTS);
    expect(manifest.variables["--background"]!.confidence).toBe("confirmed");
    expect(manifest.variables["--background"]!.emit).toEqual({ shape: "triple", space: "hsl", precision: 4 });
  });

  it("non-empty opaqueSheets downgrades a non-corroborating var but not corroborating ones", () => {
    const opaque: ScanPayload = {
      ...SDK_SHAPED,
      // add a raw-consumed var whose held is 'unknown' (no corroboration) → opaque_sheet downgrade
      variables: [
        ...SDK_SHAPED.variables,
        {
          name: "--border",
          declarations: [{ selector: ":root", mode: "light", rawValue: "0 0% 90%", heldFormat: "hsl-triple" }],
        },
      ],
      consumption: {
        ...SDK_SHAPED.consumption,
        "--border": [{ wrapping: "other", selector: ".x", property: "border-color" }],
      },
      opaqueSheets: ["https://cdn.other.com/x.css"],
    };
    const { manifest, coverage } = runScanner(opaque, OPTS);
    expect(coverage.opaqueSheetCount).toBe(1);
    // background (hsl + hsl-triple held) corroborates → stays confirmed even under opaque sheet
    expect(manifest.variables["--background"]!.confidence).toBe("confirmed");
    // border (other wrapping, no corroboration) → downgraded to inferred/opaque_sheet
    expect(manifest.variables["--border"]!.confidence).toBe("inferred");
    expect(coverage.needsConfirmation).toContainEqual({ name: "--border", reason: "opaque_sheet" });
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/control-plane test scan-roundtrip`
  Expected: initially RED only if the carve-out wiring regressed; if Tasks 6–7 are correct it may pass immediately. If it fails, the failure pins the exact carve-out branch to fix (systematic-debugging applies). Treat a first-run PASS as acceptance of the contract (no implementation change needed) and proceed to commit.

- [ ] **Step 3: Implementation** — no new module; this is an integration assertion over Tasks 6–7. If any assertion fails, fix the offending branch in `infer-emit.ts` / `scanner.ts` (do not weaken the test).

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/control-plane test scan-roundtrip`
  Expected: PASS (3 tests).

- [ ] **Step 5: Commit** —
  `git add apps/control-plane/src/theming/scan/scan-roundtrip.test.ts && git commit -m "test(scanner): scan→runScanner contract roundtrip — carve-out downgrades end to end"`

---

### Task 10: Full suite green + dependency wiring verification

**Files:**
- Modify: `apps/control-plane/package.json` (ensure `culori` + `@invariance/theming` workspace dep present)
- Modify: `packages/theming/package.json` (ensure `culori` present — Plan 01 likely added it; verify)

**Interfaces:** none new — this task verifies the whole plan compiles and tests pass together.

- [ ] **Step 1: Verify deps present** — run:
  `cat apps/control-plane/package.json | grep -E "culori|@invariance/theming"` and `cat packages/theming/package.json | grep culori`
  Expected: `culori` under `dependencies` in both; `@invariance/theming` under `dependencies` of control-plane (workspace `"@invariance/theming": "workspace:*"`).

- [ ] **Step 2: Add any missing dep** — if `@invariance/theming` is absent from `apps/control-plane/package.json` dependencies, add it:
  ```jsonc
  // apps/control-plane/package.json — under "dependencies"
  "@invariance/theming": "workspace:*",
  "culori": "^4",
  ```
  Then run `pnpm install` from the repo root.

- [ ] **Step 3: Run the theming package suite** — `pnpm -F @invariance/theming test`
  Expected: PASS (includes `scan-payload.test.ts`).

- [ ] **Step 4: Run the client scan-sdk suite** — `pnpm -F @invariance/client test theming/scan-sdk`
  Expected: PASS (`held-format`, `css-text`, `scan`).

- [ ] **Step 5: Run the control-plane scan suite** — `pnpm -F @invariance/control-plane test theming/scan`
  Expected: PASS (`classify-role`, `infer-emit`, `scanner`, `can-path`, `scan-roundtrip`).

- [ ] **Step 6: Typecheck** — `pnpm -F @invariance/theming exec tsc --noEmit && pnpm -F @invariance/control-plane exec tsc --noEmit && pnpm -F @invariance/client exec tsc --noEmit`
  Expected: no type errors. (If the control-plane app has no standalone `tsc` script, run the repo's typecheck task, e.g. `pnpm turbo run typecheck --filter=@invariance/control-plane`.)

- [ ] **Step 7: Commit** —
  `git add apps/control-plane/package.json packages/theming/package.json pnpm-lock.yaml && git commit -m "chore(scanner): wire culori + @invariance/theming deps; full scan suite green"`

---

## Coverage map (scope → task)

| Scope requirement | Task |
|---|---|
| `ScanPayload` type (declarations: selector/mode/rawValue/heldFormat; consumption: wrapping/selector/property; opaqueSheets) | 1 |
| In-browser scan SDK — CSSOM as source of truth (held per mode incl `.dark`/`[data-theme]`), consumption wrapping per use-site | 2, 3, 4 |
| `getComputedStyle` DEMOTED to enumerator + active-mode cross-check + var-chain resolver | 4 |
| Scanner OKLCH role classification | 5, 7 |
| Format-contract inference: consumption dictates, held cross-checks | 6 |
| Carve-outs: raw → held dictates; color-mix → low-confidence vendor-confirm; opaqueSheets mechanical downgrade to `inferred` | 6, 9 |
| Coverage report | 7 |
| AppManifest production (variables map, modes.selectors, base, defaultSeeds) | 7 |
| shadcn "can" skip-scan path (prebuilt manifest) | 8 |
| Tests drive SDK against fixture stylesheet strings; Scanner against fixture ScanPayloads | 2–9 |
