# Theming Pipeline — Plan 04: Artifact + Applier + Pointer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the immutable, content-addressed `ThemeArtifact` plus the one-pure-core/two-sinks applier (`renderStyleText` + `styleTag` server sink + `applyTheme` client sink) and the data-plane `Pointer`, so a verified compile output becomes a cascade-winning, fail-open `<style>` block under the app's own mode selector.

**Architecture:** A pure renderer (`renderStyleText`) emits `${selector} { --x: val; … }` for one resolved mode; the server sink wraps it in a `<style nonce>` string (nonce handed in), the client sink injects a `<style>` at the END of `<head>` (nonce discovered via the `.nonce` IDL property) and fails open if a CSP nonce is required but absent or any value is unsafe. The artifact carries no tenant (it is keyed by its own content hash over canonical JSON excluding the hash field); the tenant→hash binding is the `Pointer`, where a pointer miss and `status:"disabled"` both resolve to base but are distinct events.

**Tech Stack:** TypeScript strict + ESM, zod (schema-first), vitest, `culori` for OKLCH math elsewhere (not in this plan), `canonicalJson` from `@invariance/schema` for content-addressing, `node:crypto` `createHash` for the content address. Pure functions only — no `Date.now()`/`Math.random()`/I/O in `renderStyleText`/`hashArtifact`/`buildArtifact`.

## Global Constraints

- pnpm workspaces + turborepo; pnpm ONLY (never npm/yarn).
- TypeScript strict, ESM (`"type":"module"`).
- Workspace packages export TS source directly (`"exports": {".":"./src/index.ts"}`); no build step.
- zod is the source of truth: export BOTH `XSchema`/value and `type X = z.infer<typeof X>`. Cross-schema integrity lives in `superRefine` blocks.
- vitest; tests colocated under each package's `test/`. Run e.g. `pnpm -F @invariance/theming test`.
- OKLCH color math via culori (parse, convert, gamut-map, WCAG contrast) — used by Plans 02/03, not this plan.
- Artifact content-addressing + signing: ed25519 via `node:crypto`, canonical JSON (sorted keys).
- DETERMINISM: `compile()`/`verify()`/`renderStyleText()`/`mergeDelta()`/`diffSpecs()` must be pure — no `Date.now()`, `Math.random()`, or I/O. Stamp timestamps outside the pure core.

### Package layout (exact paths this plan touches)

- `packages/theming/` (`@invariance/theming`) — pure, plane-agnostic deterministic core, imported by BOTH control plane and data plane. Exports TS source directly, ESM, no build step.
  - `packages/theming/src/artifact/` — `ThemeArtifact`, `renderStyleText`, `styleTag`, `applyTheme`, `Pointer`, `hashArtifact`, `buildArtifact` (THIS PLAN).
  - `packages/theming/src/index.ts` — barrel re-export (owned by Plan 01; this plan appends one re-export line).
- `packages/client/src/theming/` — data-plane applier RE-EXPORTS `renderStyleText`/`applyTheme` from `@invariance/theming` (THIS PLAN adds the re-export module).

### Dependencies on other plans (consumed, do NOT redefine)

- From Plan 01 (`@invariance/theming/roles`): primitive aliases `Mode = "light" | "dark"`, `VarName = string`.
- From Plan 01 (`@invariance/theming/manifest`): `AppManifest` (for `buildArtifact`: reads `appId`, `vocabVersion`, `profileVersion`, `modes.selectors`, `invariants.chromaCap`).
- From Plan 02 (`@invariance/theming/compile`): `CandidateTheme = { light: Record<VarName,string>; dark?: Record<VarName,string>; meta: CandidateMeta }`.
- From Plan 03 (`@invariance/theming/verify`): `Verdict = { ok: true } | { ok: false; failures: VerifyFailure[] }`; `isSafeCssTokenValue(value: string): boolean`.
- From `@invariance/schema`: `canonicalJson(value: unknown): string`.

> **Bootstrapping note:** Plans 01–03 own the modules this plan imports. To let Plan 04 be implemented and tested independently if those modules are not yet present, **Task 1** adds a single `packages/theming/src/artifact/deps.ts` shim that re-exports the consumed symbols from their canonical homes (`../roles/index.js`, `../manifest/index.js`, `../compile/index.js`, `../verify/index.js`). When the upstream modules exist, this shim resolves to them unchanged. If an upstream module is absent at implementation time, the shim is where a temporary local `type`-only stub lives — but the shim's PUBLIC import path and exported names are byte-identical to the ledger, so no consumer changes when the real modules land. Do NOT inline stubs anywhere else.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/theming/src/artifact/deps.ts` | Re-export the consumed upstream symbols (`Mode`, `VarName`, `AppManifest`, `CandidateTheme`, `Verdict`, `isSafeCssTokenValue`) from their canonical homes so this plan has one import surface. |
| `packages/theming/src/artifact/theme-artifact.ts` | `ThemeArtifact` zod schema + inferred type (NO tenant; `modes.{light,dark} = {selector, vars}`; version stamps; `meta` passthrough). |
| `packages/theming/src/artifact/hash-artifact.ts` | `hashArtifact(artifact)` — content address over canonical JSON of the artifact MINUS its own hash usage (artifact has no hash field; hash is the address). |
| `packages/theming/src/artifact/build-artifact.ts` | `buildArtifact(theme, manifest, verdict)` — assembles a `ThemeArtifact` from compile output + manifest selectors + verifier report. Pure. |
| `packages/theming/src/artifact/render.ts` | `renderStyleText(artifact, mode)` — pure CSS-text core emitting `${selector} { --x: val; … }`. |
| `packages/theming/src/artifact/style-tag.ts` | `styleTag(artifact, mode, {nonce})` — server sink, returns a `<style nonce>…</style>` string. |
| `packages/theming/src/artifact/apply-theme.ts` | `applyTheme(artifact, mode, {doc})` — client sink, injects `<style>` at END of `<head>`, discovers nonce, fails open on missing-nonce-under-CSP and on unsafe values. |
| `packages/theming/src/artifact/pointer.ts` | `Pointer` zod schema + inferred type (`{hash, status, updatedAt}`). |
| `packages/theming/src/artifact/index.ts` | Barrel for the artifact module — re-exports all of the above. |
| `packages/theming/src/index.ts` | (Plan 01 owns) — append `export * from "./artifact/index.js";`. |
| `packages/client/src/theming/applier.ts` | Data-plane re-export of `renderStyleText`/`applyTheme` from `@invariance/theming`. |
| `packages/theming/test/artifact/deps.test.ts` | Shim smoke test — `isSafeCssTokenValue` is re-exported and callable (Task 1). |
| `packages/theming/test/artifact/theme-artifact.test.ts` | Schema acceptance/rejection tests. |
| `packages/theming/test/artifact/hash-artifact.test.ts` | Content-address determinism + key-order invariance tests. |
| `packages/theming/test/artifact/build-artifact.test.ts` | Assembly-from-compile-output tests. |
| `packages/theming/test/artifact/render.test.ts` | Golden-file `renderStyleText` output + cascade-win selector tests. |
| `packages/theming/test/artifact/style-tag.test.ts` | Server-sink string-shape tests. |
| `packages/theming/test/artifact/apply-theme.test.ts` | Client-sink injection + nonce-discovery + fail-open tests (jsdom). |
| `packages/theming/test/artifact/pointer.test.ts` | Pointer schema tests. |
| `packages/theming/test/artifact/barrel.test.ts` | Artifact-barrel public-surface re-export test (Task 9). |
| `packages/theming/test/artifact/roundtrip.test.ts` | Integration: compile output → build → hash → render → tag round-trip (Task 11). |
| `packages/client/test/theming/applier.test.ts` | Client re-export identity test — same `renderStyleText`/`applyTheme` (Task 10). |
| `packages/theming/test/artifact/__golden__/render-light.css` | Golden output for light render. |
| `packages/theming/test/artifact/__golden__/render-dark.css` | Golden output for dark render. |

---

### Task 1: Dependency shim — single import surface for consumed symbols

**Files:**
- Create: `packages/theming/src/artifact/deps.ts`
- Test: `packages/theming/test/artifact/deps.test.ts`

**Interfaces:**
- Consumes (from Plan 01 `@invariance/theming/roles`): `type Mode = "light" | "dark"`, `type VarName = string`.
- Consumes (from Plan 01 `@invariance/theming/manifest`): `type AppManifest`.
- Consumes (from Plan 02 `@invariance/theming/compile`): `type CandidateTheme`, `type CandidateMeta`.
- Consumes (from Plan 03 `@invariance/theming/verify`): `type Verdict`, `function isSafeCssTokenValue(value: string): boolean`.
- Produces: a re-export module exporting `Mode`, `VarName`, `AppManifest`, `CandidateTheme`, `CandidateMeta`, `Verdict`, `isSafeCssTokenValue` for use by every other Task-04 file.

Steps:

- [ ] **Step 1: Write the failing test** — FULL vitest code.

```ts
// packages/theming/test/artifact/deps.test.ts
import { describe, it, expect } from "vitest";
import * as deps from "../../src/artifact/deps.js";

describe("artifact/deps shim", () => {
  it("re-exports isSafeCssTokenValue as a callable function", () => {
    expect(typeof deps.isSafeCssTokenValue).toBe("function");
    // A plainly safe token round-trips true; this is the contract the applier relies on.
    expect(deps.isSafeCssTokenValue("oklch(0.5 0.1 200)")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test -- deps.test.ts`
  Expected failure: `Failed to resolve import "../../src/artifact/deps.js"` (the shim file does not exist yet).

- [ ] **Step 3: Minimal implementation** — FULL code.

```ts
// packages/theming/src/artifact/deps.ts
// Single import surface for the symbols this plan consumes from Plans 01/02/03.
// Public import paths + names are byte-identical to the interface ledger, so when the
// real upstream modules land this file resolves to them with no consumer changes.

export type { Mode, VarName } from "../roles/index.js";
export type { AppManifest } from "../manifest/index.js";
export type { CandidateTheme, CandidateMeta } from "../compile/index.js";
export type { Verdict } from "../verify/index.js";
export { isSafeCssTokenValue } from "../verify/index.js";
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test -- deps.test.ts`
  Expected: PASS (1 test). If `../verify/index.js` does not yet exist because Plan 03 is not implemented, this test still drives the shim's existence; coordinate so Plan 03's `verify/index.ts` exports `isSafeCssTokenValue` before this passes.

- [ ] **Step 5: Commit** — `git add packages/theming/src/artifact/deps.ts packages/theming/test/artifact/deps.test.ts && git commit -m "feat(theming): artifact deps shim — single consumed-symbol surface (Plan 04 Task 1)"`

---

### Task 2: ThemeArtifact schema (no tenant; modes.{light,dark} = {selector, vars}; version stamps)

**Files:**
- Create: `packages/theming/src/artifact/theme-artifact.ts`
- Test: `packages/theming/test/artifact/theme-artifact.test.ts`

**Interfaces:**
- Consumes: `VarName` (from `./deps.js`).
- Produces:
  - `export const ThemeArtifact: z.ZodType<...>` (zod schema value).
  - `export type ThemeArtifact = z.infer<typeof ThemeArtifact>;`

Verbatim ledger shape:

```ts
export const ThemeArtifact = z.object({
  schemaVersion: z.number(),
  vocabVersion: z.string(),
  profileVersion: z.string(),
  appId: z.string(),               // NO tenant — pure value keyed by its own content
  modes: z.object({
    light: z.object({ selector: z.string(), vars: z.record(VarName, z.string()) }),
    dark:  z.object({ selector: z.string(), vars: z.record(VarName, z.string()) }).optional(),
  }),
  meta: z.object({
    verifierReport: z.unknown(),
    contrastFloor: z.unknown(),
    chromaCap: z.number(),
  }).passthrough(),
});
export type ThemeArtifact = z.infer<typeof ThemeArtifact>;
```

Steps:

- [ ] **Step 1: Write the failing test** — FULL vitest code.

```ts
// packages/theming/test/artifact/theme-artifact.test.ts
import { describe, it, expect } from "vitest";
import { ThemeArtifact } from "../../src/artifact/theme-artifact.js";

const valid = {
  schemaVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  appId: "nebula",
  modes: {
    light: { selector: ":root", vars: { "--background": "oklch(1 0 0)" } },
    dark: { selector: ".dark", vars: { "--background": "oklch(0.15 0 0)" } },
  },
  meta: { verifierReport: { ok: true }, contrastFloor: 4.5, chromaCap: 0.4 },
};

describe("ThemeArtifact schema", () => {
  it("accepts a full valid artifact", () => {
    const r = ThemeArtifact.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("accepts a light-only artifact (dark optional)", () => {
    const { dark, ...lightOnlyModes } = valid.modes;
    const r = ThemeArtifact.safeParse({ ...valid, modes: lightOnlyModes });
    expect(r.success).toBe(true);
  });

  it("rejects an artifact carrying a tenant (no tenant field in the schema)", () => {
    // tenant is the pointer's job; the artifact is keyed by its own content.
    const parsed = ThemeArtifact.parse({ ...valid, tenant: "acme" } as unknown);
    expect("tenant" in parsed).toBe(false); // stripped, not carried into the value
  });

  it("preserves unknown meta keys (passthrough) but strips top-level unknowns", () => {
    const parsed = ThemeArtifact.parse({
      ...valid,
      meta: { ...valid.meta, debugLadder: [0.1, 0.2] },
    });
    expect((parsed.meta as Record<string, unknown>).debugLadder).toEqual([0.1, 0.2]);
  });

  it("rejects when modes.light is missing", () => {
    const { light, ...rest } = valid.modes;
    const r = ThemeArtifact.safeParse({ ...valid, modes: rest });
    expect(r.success).toBe(false);
  });

  it("rejects a non-numeric schemaVersion", () => {
    const r = ThemeArtifact.safeParse({ ...valid, schemaVersion: "1" });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test -- theme-artifact.test.ts`
  Expected failure: `Failed to resolve import "../../src/artifact/theme-artifact.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code.

```ts
// packages/theming/src/artifact/theme-artifact.ts
import { z } from "zod";
import type { VarName } from "./deps.js";

// VarName is a CSS custom-property name including the leading "--".
const VarNameKey = z.string() as z.ZodType<VarName>;

export const ThemeArtifact = z.object({
  schemaVersion: z.number(),
  vocabVersion: z.string(),
  profileVersion: z.string(),
  appId: z.string(), // NO tenant — pure value keyed by its own content (§7.1)
  modes: z.object({
    light: z.object({ selector: z.string(), vars: z.record(VarNameKey, z.string()) }),
    dark: z
      .object({ selector: z.string(), vars: z.record(VarNameKey, z.string()) })
      .optional(),
  }),
  meta: z
    .object({
      verifierReport: z.unknown(),
      contrastFloor: z.unknown(),
      chromaCap: z.number(),
    })
    .passthrough(), // applier ignores meta; eyes-on/debug fields ride through
});

export type ThemeArtifact = z.infer<typeof ThemeArtifact>;
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test -- theme-artifact.test.ts`
  Expected: PASS (6 tests).

- [ ] **Step 5: Commit** — `git add packages/theming/src/artifact/theme-artifact.ts packages/theming/test/artifact/theme-artifact.test.ts && git commit -m "feat(theming): ThemeArtifact schema — no tenant, modes={selector,vars}, version stamps (Plan 04 Task 2)"`

---

### Task 3: hashArtifact — content address over canonical JSON

**Files:**
- Create: `packages/theming/src/artifact/hash-artifact.ts`
- Test: `packages/theming/test/artifact/hash-artifact.test.ts`

**Interfaces:**
- Consumes: `ThemeArtifact` (Task 2); `canonicalJson` (from `@invariance/schema`); `createHash` (from `node:crypto`).
- Produces: `export function hashArtifact(artifact: ThemeArtifact): string;` — a lowercase hex sha256 over the canonical JSON of the artifact. The artifact has no `hash` field (the hash IS the content address), so "excluding the hash field itself" is satisfied structurally: there is nothing to exclude.

Steps:

- [ ] **Step 1: Write the failing test** — FULL vitest code.

```ts
// packages/theming/test/artifact/hash-artifact.test.ts
import { describe, it, expect } from "vitest";
import { hashArtifact } from "../../src/artifact/hash-artifact.js";
import type { ThemeArtifact } from "../../src/artifact/theme-artifact.js";

const base: ThemeArtifact = {
  schemaVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  appId: "nebula",
  modes: {
    light: { selector: ":root", vars: { "--background": "oklch(1 0 0)", "--primary": "oklch(0.6 0.2 250)" } },
  },
  meta: { verifierReport: { ok: true }, contrastFloor: 4.5, chromaCap: 0.4 },
};

describe("hashArtifact", () => {
  it("is deterministic for identical input", () => {
    expect(hashArtifact(base)).toBe(hashArtifact(base));
  });

  it("returns a 64-char lowercase hex sha256 string", () => {
    expect(hashArtifact(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is invariant to key insertion order (canonical JSON sorts keys)", () => {
    const reordered: ThemeArtifact = {
      meta: base.meta,
      modes: {
        light: {
          vars: { "--primary": "oklch(0.6 0.2 250)", "--background": "oklch(1 0 0)" },
          selector: ":root",
        },
      },
      appId: "nebula",
      profileVersion: "iv-profile-1",
      vocabVersion: "iv-roles-1",
      schemaVersion: 1,
    };
    expect(hashArtifact(reordered)).toBe(hashArtifact(base));
  });

  it("changes when any emitted var value changes", () => {
    const changed: ThemeArtifact = {
      ...base,
      modes: { light: { selector: ":root", vars: { ...base.modes.light.vars, "--primary": "oklch(0.5 0.2 250)" } } },
    };
    expect(hashArtifact(changed)).not.toBe(hashArtifact(base));
  });

  it("changes when meta changes (meta is part of the content address)", () => {
    const changed: ThemeArtifact = { ...base, meta: { ...base.meta, chromaCap: 0.3 } };
    expect(hashArtifact(changed)).not.toBe(hashArtifact(base));
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test -- hash-artifact.test.ts`
  Expected failure: `Failed to resolve import "../../src/artifact/hash-artifact.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code.

```ts
// packages/theming/src/artifact/hash-artifact.ts
import { createHash } from "node:crypto";
import { canonicalJson } from "@invariance/schema";
import type { ThemeArtifact } from "./theme-artifact.js";

// Content address over canonical JSON (sorted keys at every depth).
// The artifact carries no `hash` field — the hash IS the address — so there is
// nothing to exclude; canonicalizing the whole value is correct (§7.1).
export function hashArtifact(artifact: ThemeArtifact): string {
  return createHash("sha256").update(canonicalJson(artifact)).digest("hex");
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test -- hash-artifact.test.ts`
  Expected: PASS (5 tests). (Requires `@invariance/schema` to be a workspace dependency of `@invariance/theming`; if `Cannot find module '@invariance/schema'`, see Task 3a.)

- [ ] **Step 4a (only if Step 4 fails on the import):** add the workspace dependency.
  - Add to `packages/theming/package.json` `"dependencies"`: `"@invariance/schema": "workspace:*"`.
  - Run `pnpm install` at repo root.
  - Re-run Step 4.

- [ ] **Step 5: Commit** — `git add packages/theming/src/artifact/hash-artifact.ts packages/theming/test/artifact/hash-artifact.test.ts packages/theming/package.json && git commit -m "feat(theming): hashArtifact — sha256 content address over canonical JSON (Plan 04 Task 3)"`

---

### Task 4: buildArtifact — assemble artifact from compile output + manifest + verdict

**Files:**
- Create: `packages/theming/src/artifact/build-artifact.ts`
- Test: `packages/theming/test/artifact/build-artifact.test.ts`

**Interfaces:**
- Consumes: `CandidateTheme`, `AppManifest`, `Verdict` (from `./deps.js`); `ThemeArtifact` (Task 2).
- Produces: `export function buildArtifact(theme: CandidateTheme, manifest: AppManifest, verdict: Verdict): ThemeArtifact;` — pure. Maps:
  - `appId`/`vocabVersion`/`profileVersion` from the manifest (versions are the published stamp).
  - `schemaVersion` = the module constant `ARTIFACT_SCHEMA_VERSION = 1`.
  - `modes.light.selector` = `manifest.modes.selectors.light`; `modes.light.vars` = `theme.light`.
  - `modes.dark` present iff `theme.dark` AND `manifest.modes.selectors.dark` are both present; `selector` from the manifest, `vars` from `theme.dark`.
  - `meta.verifierReport` = `verdict`; `meta.chromaCap` = `manifest.invariants.chromaCap`; `meta.contrastFloor` = `manifest.invariants.contrastTier`.

Steps:

- [ ] **Step 1: Write the failing test** — FULL vitest code.

```ts
// packages/theming/test/artifact/build-artifact.test.ts
import { describe, it, expect } from "vitest";
import { buildArtifact, ARTIFACT_SCHEMA_VERSION } from "../../src/artifact/build-artifact.js";
import { ThemeArtifact } from "../../src/artifact/theme-artifact.js";
import type { CandidateTheme, AppManifest, Verdict } from "../../src/artifact/deps.js";

const theme: CandidateTheme = {
  light: { "--background": "oklch(1 0 0)", "--primary": "oklch(0.6 0.2 250)" },
  dark: { "--background": "oklch(0.15 0 0)", "--primary": "oklch(0.7 0.2 250)" },
  meta: { vocabVersion: "iv-roles-1", profileVersion: "iv-profile-1" },
};

// Minimal manifest shape this function reads — cast to AppManifest for the test.
const manifest = {
  appId: "nebula",
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  modes: { allowed: ["light", "dark"], default: "light", selectors: { light: ":root", dark: ".dark" } },
  invariants: { contrastTier: "AA", chromaCap: 0.4 },
} as unknown as AppManifest;

const verdict: Verdict = { ok: true };

describe("buildArtifact", () => {
  it("produces a schema-valid ThemeArtifact", () => {
    const art = buildArtifact(theme, manifest, verdict);
    expect(ThemeArtifact.safeParse(art).success).toBe(true);
  });

  it("stamps appId + versions from the manifest and schemaVersion from the constant", () => {
    const art = buildArtifact(theme, manifest, verdict);
    expect(art.appId).toBe("nebula");
    expect(art.vocabVersion).toBe("iv-roles-1");
    expect(art.profileVersion).toBe("iv-profile-1");
    expect(art.schemaVersion).toBe(ARTIFACT_SCHEMA_VERSION);
  });

  it("rides the per-mode selectors from the manifest, vars from the compile output", () => {
    const art = buildArtifact(theme, manifest, verdict);
    expect(art.modes.light.selector).toBe(":root");
    expect(art.modes.light.vars).toEqual(theme.light);
    expect(art.modes.dark?.selector).toBe(".dark");
    expect(art.modes.dark?.vars).toEqual(theme.dark);
  });

  it("omits dark when the compile output has no dark ladder", () => {
    const lightOnly: CandidateTheme = { light: theme.light, meta: theme.meta };
    const art = buildArtifact(lightOnly, manifest, verdict);
    expect(art.modes.dark).toBeUndefined();
  });

  it("omits dark when the manifest declares no dark selector even if theme.dark exists", () => {
    const noDarkSelector = {
      ...manifest,
      modes: { ...manifest.modes, selectors: { light: ":root" } },
    } as unknown as AppManifest;
    const art = buildArtifact(theme, noDarkSelector, verdict);
    expect(art.modes.dark).toBeUndefined();
  });

  it("carries the verdict + chromaCap + contrastFloor into meta", () => {
    const art = buildArtifact(theme, manifest, verdict);
    expect(art.meta.verifierReport).toEqual(verdict);
    expect(art.meta.chromaCap).toBe(0.4);
    expect(art.meta.contrastFloor).toBe("AA");
  });

  it("is pure — same inputs yield deeply-equal output", () => {
    expect(buildArtifact(theme, manifest, verdict)).toEqual(buildArtifact(theme, manifest, verdict));
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test -- build-artifact.test.ts`
  Expected failure: `Failed to resolve import "../../src/artifact/build-artifact.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code.

```ts
// packages/theming/src/artifact/build-artifact.ts
import type { CandidateTheme, AppManifest, Verdict } from "./deps.js";
import type { ThemeArtifact } from "./theme-artifact.js";

export const ARTIFACT_SCHEMA_VERSION = 1 as const;

// Pure: compile output + manifest selectors + verifier report → an immutable artifact.
// Dark rides through ONLY when both a dark ladder and a dark selector exist (a dark block
// with no selector cannot cascade-win; §6 refPerModeSelectorPresent / §7.2).
export function buildArtifact(
  theme: CandidateTheme,
  manifest: AppManifest,
  verdict: Verdict,
): ThemeArtifact {
  const darkSelector = manifest.modes.selectors.dark;
  const dark =
    theme.dark && darkSelector
      ? { selector: darkSelector, vars: theme.dark }
      : undefined;

  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    vocabVersion: manifest.vocabVersion,
    profileVersion: manifest.profileVersion,
    appId: manifest.appId,
    modes: {
      light: { selector: manifest.modes.selectors.light, vars: theme.light },
      ...(dark ? { dark } : {}),
    },
    meta: {
      verifierReport: verdict,
      contrastFloor: manifest.invariants.contrastTier,
      chromaCap: manifest.invariants.chromaCap,
    },
  };
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test -- build-artifact.test.ts`
  Expected: PASS (7 tests).

- [ ] **Step 5: Commit** — `git add packages/theming/src/artifact/build-artifact.ts packages/theming/test/artifact/build-artifact.test.ts && git commit -m "feat(theming): buildArtifact — compile output + manifest + verdict → ThemeArtifact (Plan 04 Task 4)"`

---

### Task 5: renderStyleText — pure CSS-text core (cascade-win selector) + golden files

**Files:**
- Create: `packages/theming/src/artifact/render.ts`
- Create: `packages/theming/test/artifact/__golden__/render-light.css`
- Create: `packages/theming/test/artifact/__golden__/render-dark.css`
- Test: `packages/theming/test/artifact/render.test.ts`

**Interfaces:**
- Consumes: `ThemeArtifact` (Task 2); `Mode`, `VarName` (from `./deps.js`).
- Produces: `export function renderStyleText(artifact: ThemeArtifact, mode: Mode): string;` — pure. Emits `${selector} {\n  --x: val;\n  ...\n}\n` for the requested resolved mode under the app's OWN mode selector (cascade-win). Vars are emitted in sorted-key order (determinism / golden stability). Vars are already emit-serialized by the compiler — `renderStyleText` does NOT re-serialize values. Requesting `mode: "dark"` when the artifact has no dark block returns `""` (nothing to render; caller falls open).

Steps:

- [ ] **Step 1: Write the failing test** — FULL vitest code AND the two golden files.

```ts
// packages/theming/test/artifact/render.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderStyleText } from "../../src/artifact/render.js";
import type { ThemeArtifact } from "../../src/artifact/theme-artifact.js";

const golden = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__golden__/${name}`, import.meta.url)), "utf8");

const artifact: ThemeArtifact = {
  schemaVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  appId: "nebula",
  modes: {
    // Insertion order is deliberately scrambled to prove sorted-key output.
    light: { selector: ":root", vars: { "--primary": "oklch(0.6 0.2 250)", "--background": "oklch(1 0 0)" } },
    dark: { selector: ".dark", vars: { "--background": "oklch(0.15 0 0)", "--primary": "oklch(0.7 0.2 250)" } },
  },
  meta: { verifierReport: { ok: true }, contrastFloor: 4.5, chromaCap: 0.4 },
};

describe("renderStyleText", () => {
  it("emits the light block under the app's own light selector (golden)", () => {
    expect(renderStyleText(artifact, "light")).toBe(golden("render-light.css"));
  });

  it("emits the dark block under the app's own dark selector for cascade-win (golden)", () => {
    const out = renderStyleText(artifact, "dark");
    expect(out).toBe(golden("render-dark.css"));
    expect(out.startsWith(".dark {")).toBe(true); // NOT bare :root — specificity parity (§7.2)
  });

  it("emits vars in sorted-key order regardless of insertion order", () => {
    const out = renderStyleText(artifact, "light");
    expect(out.indexOf("--background")).toBeLessThan(out.indexOf("--primary"));
  });

  it("does NOT re-serialize values — vars ride through verbatim", () => {
    expect(renderStyleText(artifact, "light")).toContain("--primary: oklch(0.6 0.2 250);");
  });

  it("returns empty string when the requested mode has no block (fail-open upstream)", () => {
    const lightOnly: ThemeArtifact = { ...artifact, modes: { light: artifact.modes.light } };
    expect(renderStyleText(lightOnly, "dark")).toBe("");
  });

  it("is pure — same inputs yield identical output", () => {
    expect(renderStyleText(artifact, "light")).toBe(renderStyleText(artifact, "light"));
  });
});
```

Create `packages/theming/test/artifact/__golden__/render-light.css` with EXACTLY these bytes (no comment header, two-space var indentation, one trailing newline after the closing `}`):

```
:root {
  --background: oklch(1 0 0);
  --primary: oklch(0.6 0.2 250);
}
```

Create `packages/theming/test/artifact/__golden__/render-dark.css` with EXACTLY these bytes (same rules):

```
.dark {
  --background: oklch(0.15 0 0);
  --primary: oklch(0.7 0.2 250);
}
```

> **Golden-file note:** the two fenced blocks above are the EXACT file contents — do NOT add a `/* … */` header, a language tag inside the file, or extra blank lines. Each file's bytes are: the selector line `<selector> {`, two `  --x: val;` lines (two-space indent), the closing `}`, then exactly ONE trailing `\n`. `renderStyleText` emits no comment, so any header in the fixture fails the golden assertion.

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test -- render.test.ts`
  Expected failure: `Failed to resolve import "../../src/artifact/render.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code.

```ts
// packages/theming/src/artifact/render.ts
import type { ThemeArtifact } from "./theme-artifact.js";
import type { Mode, VarName } from "./deps.js";

// Pure CSS-text core. Emits `${selector} { --x: val; … }` for ONE resolved mode under the
// app's OWN mode selector (cascade-win, §7.2). Values are already emit-serialized by the
// compiler — we never re-serialize. Vars are sorted for deterministic, golden-stable output.
export function renderStyleText(artifact: ThemeArtifact, mode: Mode): string {
  const block = artifact.modes[mode];
  if (!block) return ""; // no block for this mode → render nothing; caller falls open
  const names = (Object.keys(block.vars) as VarName[]).sort();
  const lines = names.map((name) => `  ${name}: ${block.vars[name]};`);
  return `${block.selector} {\n${lines.join("\n")}\n}\n`;
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test -- render.test.ts`
  Expected: PASS (6 tests). If a golden assertion fails on whitespace, confirm the fixture has exactly one trailing newline and two-space var indentation.

- [ ] **Step 5: Commit** — `git add packages/theming/src/artifact/render.ts packages/theming/test/artifact/render.test.ts packages/theming/test/artifact/__golden__/render-light.css packages/theming/test/artifact/__golden__/render-dark.css && git commit -m "feat(theming): renderStyleText — pure cascade-win CSS core + golden files (Plan 04 Task 5)"`

---

### Task 6: styleTag — server sink (nonce handed in)

**Files:**
- Create: `packages/theming/src/artifact/style-tag.ts`
- Test: `packages/theming/test/artifact/style-tag.test.ts`

**Interfaces:**
- Consumes: `renderStyleText` (Task 5); `ThemeArtifact` (Task 2); `Mode` (from `./deps.js`).
- Produces: `export function styleTag(artifact: ThemeArtifact, mode: Mode, opts: { nonce: string }): string;` — returns a `<style nonce="…">…</style>` string for SSR inlining. Nonce is HANDED in (server-minted). When `renderStyleText` returns `""` (no block for the mode), returns `""` (emit no tag → fail open at the document level).

Steps:

- [ ] **Step 1: Write the failing test** — FULL vitest code.

```ts
// packages/theming/test/artifact/style-tag.test.ts
import { describe, it, expect } from "vitest";
import { styleTag } from "../../src/artifact/style-tag.js";
import type { ThemeArtifact } from "../../src/artifact/theme-artifact.js";

const artifact: ThemeArtifact = {
  schemaVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  appId: "nebula",
  modes: {
    light: { selector: ":root", vars: { "--background": "oklch(1 0 0)" } },
    dark: { selector: ".dark", vars: { "--background": "oklch(0.15 0 0)" } },
  },
  meta: { verifierReport: { ok: true }, contrastFloor: 4.5, chromaCap: 0.4 },
};

describe("styleTag (server sink)", () => {
  it("wraps the rendered CSS in a <style> carrying the handed-in nonce", () => {
    const tag = styleTag(artifact, "light", { nonce: "abc123" });
    expect(tag.startsWith('<style nonce="abc123">')).toBe(true);
    expect(tag.endsWith("</style>")).toBe(true);
    expect(tag).toContain("--background: oklch(1 0 0);");
  });

  it("uses the dark selector for the dark mode (cascade-win rides through)", () => {
    const tag = styleTag(artifact, "dark", { nonce: "n" });
    expect(tag).toContain(".dark {");
  });

  it("returns empty string when the requested mode has no block (fail open)", () => {
    const lightOnly: ThemeArtifact = { ...artifact, modes: { light: artifact.modes.light } };
    expect(styleTag(lightOnly, "dark", { nonce: "n" })).toBe("");
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test -- style-tag.test.ts`
  Expected failure: `Failed to resolve import "../../src/artifact/style-tag.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code.

```ts
// packages/theming/src/artifact/style-tag.ts
import type { ThemeArtifact } from "./theme-artifact.js";
import type { Mode } from "./deps.js";
import { renderStyleText } from "./render.js";

// SERVER sink. Nonce is server-minted and handed in. Empty render → empty tag (fail open).
export function styleTag(
  artifact: ThemeArtifact,
  mode: Mode,
  opts: { nonce: string },
): string {
  const css = renderStyleText(artifact, mode);
  if (css === "") return "";
  return `<style nonce="${opts.nonce}">${css}</style>`;
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test -- style-tag.test.ts`
  Expected: PASS (3 tests).

- [ ] **Step 5: Commit** — `git add packages/theming/src/artifact/style-tag.ts packages/theming/test/artifact/style-tag.test.ts && git commit -m "feat(theming): styleTag — server sink, nonce handed in (Plan 04 Task 6)"`

---

### Task 7: applyTheme — client sink (nonce discovered, inject at end of head, fail-open)

**Files:**
- Create: `packages/theming/src/artifact/apply-theme.ts`
- Test: `packages/theming/test/artifact/apply-theme.test.ts`

**Interfaces:**
- Consumes: `renderStyleText` (Task 5); `isSafeCssTokenValue` (from `./deps.js`); `ThemeArtifact` (Task 2); `Mode` (from `./deps.js`).
- Produces: `export function applyTheme(artifact: ThemeArtifact, mode: Mode, opts: { doc: Document }): void;` — CLIENT sink. Discovers the nonce via `doc.querySelector("style[nonce],script[nonce]")?.nonce` (the `.nonce` IDL property). Injects a `<style>` at the END of `<head>` so source-order wins the cascade tie. Fail-open rules: (1) every emitted var value must pass `isSafeCssTokenValue`; any unsafe value → inject nothing; (2) if no trusted nonced element is found AND CSP is enforced → inject nothing (we detect "CSP enforced" by the presence of any pre-existing nonced element on the page being the trust signal; absent any nonced element we treat CSP as not enforced and inject WITHOUT a nonce — matching §7.2 "No trusted element found AND CSP enforced → inject nothing"). (3) requesting a mode with no block → inject nothing.

> **CSP-enforced detection rule (made concrete):** the only reliable client signal that CSP nonces are required is that the server already minted one on some element. So: if a nonced element exists, we MUST reuse its nonce (CSP enforced); if we find one, inject the `<style>` WITH that nonce. If NO nonced element exists anywhere, CSP-with-nonces is not in force, so injecting an un-nonced `<style>` is safe and we do so. The fail-open branch ("inject nothing") therefore fires when a nonced element exists but its `.nonce` is empty/undefined — i.e. CSP is enforced but we cannot obtain a usable nonce.

Steps:

- [ ] **Step 1: Write the failing test** — FULL vitest code (jsdom environment).

```ts
// packages/theming/test/artifact/apply-theme.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { applyTheme } from "../../src/artifact/apply-theme.js";
import type { ThemeArtifact } from "../../src/artifact/theme-artifact.js";

const artifact: ThemeArtifact = {
  schemaVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  appId: "nebula",
  modes: {
    light: { selector: ":root", vars: { "--background": "oklch(1 0 0)" } },
    dark: { selector: ".dark", vars: { "--background": "oklch(0.15 0 0)" } },
  },
  meta: { verifierReport: { ok: true }, contrastFloor: 4.5, chromaCap: 0.4 },
};

const injected = (doc: Document) =>
  Array.from(doc.head.querySelectorAll("style")).filter((s) => s.textContent?.includes("--background"));

beforeEach(() => {
  document.head.innerHTML = "";
});

describe("applyTheme (client sink)", () => {
  it("injects a <style> at the END of <head>", () => {
    const marker = document.createElement("meta");
    document.head.appendChild(marker);
    applyTheme(artifact, "light", { doc: document });
    const last = document.head.lastElementChild!;
    expect(last.tagName).toBe("STYLE");
    expect(last.textContent).toContain("--background: oklch(1 0 0);");
  });

  it("discovers and reuses a pre-existing nonce (CSP enforced path)", () => {
    const s = document.createElement("script");
    s.setAttribute("nonce", "server-nonce");
    document.head.appendChild(s);
    applyTheme(artifact, "light", { doc: document });
    const styled = injected(document)[0];
    expect(styled.nonce).toBe("server-nonce");
  });

  it("injects WITHOUT a nonce when no nonced element exists (CSP not enforced)", () => {
    applyTheme(artifact, "light", { doc: document });
    const styled = injected(document)[0];
    expect(styled).toBeTruthy();
    expect(styled.getAttribute("nonce")).toBeNull();
  });

  it("injects NOTHING when a nonced element exists but its nonce is empty (CSP enforced, no usable nonce → fail open)", () => {
    const s = document.createElement("script");
    s.setAttribute("nonce", "");
    document.head.appendChild(s);
    applyTheme(artifact, "light", { doc: document });
    expect(injected(document).length).toBe(0);
  });

  it("injects NOTHING when an emitted value is unsafe (fail open)", () => {
    const unsafe: ThemeArtifact = {
      ...artifact,
      modes: { light: { selector: ":root", vars: { "--background": "red; } body { display:none" } } },
    };
    applyTheme(unsafe, "light", { doc: document });
    expect(document.head.querySelectorAll("style").length).toBe(0);
  });

  it("injects NOTHING when the requested mode has no block", () => {
    const lightOnly: ThemeArtifact = { ...artifact, modes: { light: artifact.modes.light } };
    applyTheme(lightOnly, "dark", { doc: document });
    expect(document.head.querySelectorAll("style").length).toBe(0);
  });

  it("emits the dark selector when applying dark", () => {
    applyTheme(artifact, "dark", { doc: document });
    expect(injected(document)[0].textContent).toContain(".dark {");
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test -- apply-theme.test.ts`
  Expected failure: `Failed to resolve import "../../src/artifact/apply-theme.js"`. (If instead it fails with `document is not defined`, ensure the `// @vitest-environment jsdom` pragma is the first line and `jsdom` is installed — see Step 4a.)

- [ ] **Step 3: Minimal implementation** — FULL code.

```ts
// packages/theming/src/artifact/apply-theme.ts
import type { ThemeArtifact } from "./theme-artifact.js";
import type { Mode } from "./deps.js";
import { isSafeCssTokenValue } from "./deps.js";
import { renderStyleText } from "./render.js";

// CLIENT sink. Injects a <style> at the END of <head> (source-order cascade win).
// Nonce is DISCOVERED via the .nonce IDL property. Fail open: unsafe value, or
// CSP-enforced-but-no-usable-nonce, or no block → inject nothing. (§7.2)
export function applyTheme(
  artifact: ThemeArtifact,
  mode: Mode,
  opts: { doc: Document },
): void {
  const block = artifact.modes[mode];
  if (!block) return; // no block for this mode → inject nothing

  // Final apply-time safety gate: any unsafe value → inject nothing (fail open, §1.3).
  for (const value of Object.values(block.vars)) {
    if (!isSafeCssTokenValue(value)) return;
  }

  const css = renderStyleText(artifact, mode);
  if (css === "") return;

  const { doc } = opts;
  // Discover a trusted nonce via the .nonce IDL property (the attribute is hidden in the DOM).
  const trusted = doc.querySelector("style[nonce],script[nonce]") as
    | (HTMLElement & { nonce?: string })
    | null;

  const style = doc.createElement("style");
  if (trusted) {
    // A nonced element exists ⇒ CSP nonces are in force. We MUST carry a usable nonce.
    const nonce = trusted.nonce;
    if (!nonce) return; // CSP enforced but no usable nonce → fail open
    style.nonce = nonce;
  }
  // else: no nonced element anywhere ⇒ CSP-with-nonces not enforced ⇒ inject without a nonce.

  style.textContent = css;
  doc.head.appendChild(style); // END of <head> → source-order breaks the cascade tie in our favor
}
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test -- apply-theme.test.ts`
  Expected: PASS (7 tests).

- [ ] **Step 4a (only if Step 4 fails on `document is not defined` or `Cannot find environment 'jsdom'`):** add the jsdom dev dependency.
  - Run at repo root: `pnpm -F @invariance/theming add -D jsdom`.
  - Re-run Step 4.

- [ ] **Step 5: Commit** — `git add packages/theming/src/artifact/apply-theme.ts packages/theming/test/artifact/apply-theme.test.ts packages/theming/package.json && git commit -m "feat(theming): applyTheme — client sink, discovered nonce, end-of-head inject, fail-open (Plan 04 Task 7)"`

---

### Task 8: Pointer schema (pointer-miss vs disabled are distinct)

**Files:**
- Create: `packages/theming/src/artifact/pointer.ts`
- Test: `packages/theming/test/artifact/pointer.test.ts`

**Interfaces:**
- Consumes: nothing (zod only).
- Produces:
  - `export const Pointer: z.ZodType<...>` with shape `{ hash: string; status: "live" | "disabled"; updatedAt: string }`.
  - `export type Pointer = z.infer<typeof Pointer>;`

> **Pointer-miss vs disabled:** the schema models only a PRESENT pointer. A pointer MISS (no KV key) is the absence of any `Pointer` value (a `null` from the store), distinct from a present pointer with `status:"disabled"`. The delivery adapter (Plan 07) maps `null → "pointer_miss"` and `status:"disabled" → "pointer_disabled"`; both resolve to base but are distinct telemetry. This task asserts the schema does NOT collapse the two.

Steps:

- [ ] **Step 1: Write the failing test** — FULL vitest code.

```ts
// packages/theming/test/artifact/pointer.test.ts
import { describe, it, expect } from "vitest";
import { Pointer } from "../../src/artifact/pointer.js";

describe("Pointer schema", () => {
  it("accepts a live pointer", () => {
    const r = Pointer.safeParse({ hash: "deadbeef", status: "live", updatedAt: "2026-06-18T00:00:00.000Z" });
    expect(r.success).toBe(true);
  });

  it("accepts a disabled (kill-switched) pointer", () => {
    const r = Pointer.safeParse({ hash: "deadbeef", status: "disabled", updatedAt: "2026-06-18T00:00:00.000Z" });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const r = Pointer.safeParse({ hash: "x", status: "paused", updatedAt: "2026-06-18T00:00:00.000Z" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing hash", () => {
    const r = Pointer.safeParse({ status: "live", updatedAt: "2026-06-18T00:00:00.000Z" });
    expect(r.success).toBe(false);
  });

  it("models a present pointer only — a miss is the absence of a value, not status:'disabled'", () => {
    // A disabled pointer is a real value; a miss (null) never parses to this shape.
    expect(Pointer.safeParse(null).success).toBe(false);
    expect(Pointer.parse({ hash: "h", status: "disabled", updatedAt: "t" }).status).toBe("disabled");
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test -- pointer.test.ts`
  Expected failure: `Failed to resolve import "../../src/artifact/pointer.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code.

```ts
// packages/theming/src/artifact/pointer.ts
import { z } from "zod";

// The data-plane contract (§7.3). KV: tenant → Pointer. Publish and kill-switch are
// BOTH a pointer write. A pointer MISS (no key → null from the store) is distinct from
// status:"disabled"; both resolve to base but are distinct telemetry events (Plan 07).
export const Pointer = z.object({
  hash: z.string(),
  status: z.enum(["live", "disabled"]),
  updatedAt: z.string(), // ISO timestamp — stamped outside any pure core
});

export type Pointer = z.infer<typeof Pointer>;
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/theming test -- pointer.test.ts`
  Expected: PASS (5 tests).

- [ ] **Step 5: Commit** — `git add packages/theming/src/artifact/pointer.ts packages/theming/test/artifact/pointer.test.ts && git commit -m "feat(theming): Pointer schema — {hash,status,updatedAt}, miss vs disabled distinct (Plan 04 Task 8)"`

---

### Task 9: artifact barrel + theming barrel re-export

**Files:**
- Create: `packages/theming/src/artifact/index.ts`
- Modify: `packages/theming/src/index.ts` (Plan 01 owns the file; append one line)
- Test: `packages/theming/test/artifact/barrel.test.ts`

**Interfaces:**
- Consumes: all Task 2–8 modules.
- Produces: `@invariance/theming/artifact` barrel exporting `ThemeArtifact`, `hashArtifact`, `buildArtifact`, `ARTIFACT_SCHEMA_VERSION`, `renderStyleText`, `styleTag`, `applyTheme`, `Pointer`. The top-level `@invariance/theming` barrel re-exports the same.

Steps:

- [ ] **Step 1: Write the failing test** — FULL vitest code.

```ts
// packages/theming/test/artifact/barrel.test.ts
import { describe, it, expect } from "vitest";
import * as artifactBarrel from "../../src/artifact/index.js";

describe("artifact barrel", () => {
  it("re-exports the public surface", () => {
    expect(typeof artifactBarrel.hashArtifact).toBe("function");
    expect(typeof artifactBarrel.buildArtifact).toBe("function");
    expect(typeof artifactBarrel.renderStyleText).toBe("function");
    expect(typeof artifactBarrel.styleTag).toBe("function");
    expect(typeof artifactBarrel.applyTheme).toBe("function");
    expect(artifactBarrel.ThemeArtifact).toBeDefined(); // zod schema value
    expect(artifactBarrel.Pointer).toBeDefined();
    expect(artifactBarrel.ARTIFACT_SCHEMA_VERSION).toBe(1);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test -- barrel.test.ts`
  Expected failure: `Failed to resolve import "../../src/artifact/index.js"`.

- [ ] **Step 3: Minimal implementation** — FULL code.

```ts
// packages/theming/src/artifact/index.ts
export { ThemeArtifact } from "./theme-artifact.js";
export { hashArtifact } from "./hash-artifact.js";
export { buildArtifact, ARTIFACT_SCHEMA_VERSION } from "./build-artifact.js";
export { renderStyleText } from "./render.js";
export { styleTag } from "./style-tag.js";
export { applyTheme } from "./apply-theme.js";
export { Pointer } from "./pointer.js";
```

> **Type/value name note (ledger rule #3):** `ThemeArtifact` and `Pointer` are each BOTH a zod value AND an inferred type sharing the identifier. A barrel `export { ThemeArtifact }` re-exports the value binding, and TypeScript carries the type along because a re-exported name that is both a value and a type in the source module stays both at the re-export site — so `import { ThemeArtifact } from "@invariance/theming"` resolves in both value and type positions. Do NOT add a divergent alias (`ThemeArtifactType`/`PointerType` are not in the ledger; inventing them violates the ledger's naming discipline). The canonical names are exactly `ThemeArtifact` and `Pointer`.

- [ ] **Step 4 (modify the top-level barrel):** append the artifact re-export to `packages/theming/src/index.ts`.
  - If the file does not yet exist (Plan 01 not implemented), CREATE it with exactly:

```ts
// packages/theming/src/index.ts
export * from "./artifact/index.js";
```

  - If it exists, append the single line `export * from "./artifact/index.js";` to the end (do not reorder Plan 01's existing exports).

- [ ] **Step 5: Run tests, verify pass** — `pnpm -F @invariance/theming test -- barrel.test.ts`
  Expected: PASS (1 test).

- [ ] **Step 6: Commit** — `git add packages/theming/src/artifact/index.ts packages/theming/src/index.ts packages/theming/test/artifact/barrel.test.ts && git commit -m "feat(theming): artifact barrel + top-level re-export (Plan 04 Task 9)"`

---

### Task 10: Data-plane client re-export of renderStyleText/applyTheme

**Files:**
- Create: `packages/client/src/theming/applier.ts`
- Test: `packages/client/test/theming/applier.test.ts`

**Interfaces:**
- Consumes: `renderStyleText`, `applyTheme` (from `@invariance/theming`).
- Produces: a data-plane module re-exporting `renderStyleText` and `applyTheme` so the client SDK applies themes without importing the control-plane surface.

> **Why a re-export (not a copy):** the ledger and §7.2 mandate "one pure core, two sinks." The client SDK uses the SAME `renderStyleText`/`applyTheme` from `@invariance/theming`; the data plane just re-surfaces them under `packages/client/src/theming` so callers import from the client package. No logic lives here.

Steps:

- [ ] **Step 1: Write the failing test** — FULL vitest code.

```ts
// packages/client/test/theming/applier.test.ts
import { describe, it, expect } from "vitest";
import * as applier from "../../src/theming/applier.js";
import { renderStyleText, applyTheme } from "@invariance/theming";

describe("client data-plane applier re-export", () => {
  it("re-exports the SAME renderStyleText/applyTheme from @invariance/theming", () => {
    expect(applier.renderStyleText).toBe(renderStyleText);
    expect(applier.applyTheme).toBe(applyTheme);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/client test -- applier.test.ts`
  Expected failure: `Failed to resolve import "../../src/theming/applier.js"` (or `Cannot find module '@invariance/theming'` if the dep is missing — see Step 4a).

- [ ] **Step 3: Minimal implementation** — FULL code.

```ts
// packages/client/src/theming/applier.ts
// Data-plane applier: the SAME pure core + client sink as the control plane,
// re-surfaced under @invariance/client so the SDK does not import control-plane code.
// "One pure core, two sinks" (§7.2) — no logic lives here.
export { renderStyleText, applyTheme } from "@invariance/theming";
```

- [ ] **Step 4: Run tests, verify pass** — `pnpm -F @invariance/client test -- applier.test.ts`
  Expected: PASS (1 test).

- [ ] **Step 4a (only if Step 4 fails on `Cannot find module '@invariance/theming'`):** add the workspace dependency.
  - Add to `packages/client/package.json` `"dependencies"`: `"@invariance/theming": "workspace:*"`.
  - Run `pnpm install` at repo root.
  - Re-run Step 4.

- [ ] **Step 5: Commit** — `git add packages/client/src/theming/applier.ts packages/client/test/theming/applier.test.ts packages/client/package.json && git commit -m "feat(client): data-plane applier re-export of renderStyleText/applyTheme (Plan 04 Task 10)"`

---

### Task 11: Full-suite green + end-to-end artifact round-trip sanity

**Files:**
- Test: `packages/theming/test/artifact/roundtrip.test.ts`

**Interfaces:**
- Consumes: `buildArtifact`, `hashArtifact`, `renderStyleText`, `styleTag` (barrel); `CandidateTheme`, `AppManifest`, `Verdict` (from `./deps.js`).
- Produces: an integration test proving compile-output → `buildArtifact` → `hashArtifact` is stable and the artifact renders/wraps correctly in both sinks for the resolved default mode. No new production code.

Steps:

- [ ] **Step 1: Write the failing test** — FULL vitest code.

```ts
// packages/theming/test/artifact/roundtrip.test.ts
import { describe, it, expect } from "vitest";
import { buildArtifact, hashArtifact, renderStyleText, styleTag } from "../../src/artifact/index.js";
import type { CandidateTheme, AppManifest, Verdict } from "../../src/artifact/deps.js";

const theme: CandidateTheme = {
  light: { "--background": "oklch(1 0 0)", "--primary": "oklch(0.6 0.2 250)" },
  dark: { "--background": "oklch(0.15 0 0)", "--primary": "oklch(0.7 0.2 250)" },
  meta: { vocabVersion: "iv-roles-1", profileVersion: "iv-profile-1" },
};
const manifest = {
  appId: "nebula",
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  modes: { allowed: ["light", "dark"], default: "dark", selectors: { light: ":root", dark: ".dark" } },
  invariants: { contrastTier: "AA", chromaCap: 0.4 },
} as unknown as AppManifest;
const verdict: Verdict = { ok: true };

describe("artifact round-trip (compile → build → hash → render → tag)", () => {
  it("builds a stable content address from compile output", () => {
    const a = buildArtifact(theme, manifest, verdict);
    const b = buildArtifact(theme, manifest, verdict);
    expect(hashArtifact(a)).toBe(hashArtifact(b));
  });

  it("renders the configured default mode under the app's own selector (cold-start, §7.2)", () => {
    const art = buildArtifact(theme, manifest, verdict);
    const css = renderStyleText(art, manifest.modes.default); // default is "dark" here
    expect(css.startsWith(".dark {")).toBe(true);
  });

  it("wraps the default-mode render in a nonced server tag", () => {
    const art = buildArtifact(theme, manifest, verdict);
    const tag = styleTag(art, manifest.modes.default, { nonce: "n1" });
    expect(tag.startsWith('<style nonce="n1">')).toBe(true);
    expect(tag).toContain(".dark {");
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm -F @invariance/theming test -- roundtrip.test.ts`
  Expected failure: `Failed to resolve import "../../src/artifact/roundtrip.test"`? No — the test file resolves; it fails ONLY if a prior task's export is missing. If all prior tasks are done, run Step 2 BEFORE writing any code change: the test should already PASS (no new production code). If it fails, the failure names the missing symbol (e.g. `styleTag is not a function`) — fix by completing the referenced prior task, not by editing this test.

- [ ] **Step 3: Minimal implementation** — none. This task adds no production code; it is the integration net over Tasks 2–9. (If Step 2 surfaced a real gap, the fix lives in the owning task's file, re-run that task's tests too.)

- [ ] **Step 4: Run the WHOLE package suite, verify pass** — `pnpm -F @invariance/theming test`
  Expected: PASS — all artifact tests green (Tasks 1–9 + this round-trip). Then `pnpm -F @invariance/client test` Expected: PASS (Task 10).

- [ ] **Step 5: Commit** — `git add packages/theming/test/artifact/roundtrip.test.ts && git commit -m "test(theming): artifact round-trip integration — build→hash→render→tag (Plan 04 Task 11)"`
