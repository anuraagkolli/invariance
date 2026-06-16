# Phase 2 — Applier Indirection (role → vendor variable) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a compiled v2 theme by redefining the *vendor's own* CSS variables (e.g. `--primary`) with the compiler's role VALUES, via the `variable→role` map — instead of writing Invariance's `--inv-*` role tokens — so a vendor app re-themes with zero source edits.

**Architecture:** Purely additive. A new `packages/design/src/runtime/apply-mapped.ts` reuses the existing `themeToCssEntries` (the single source of truth for which entries a v2 theme writes, and in what order), inverts the `variable→role` map (role token → the vendor variable name(s) bound to it), and `setProperty`s the compiled value onto the vendor's names. The base `--inv-*` apply path (`applyThemeJsonV2`) is left untouched — it stays the identity/Trial-snippet path; this is a parallel applier. Fail-open by construction.

**Tech Stack:** TypeScript (strict, ESM), vitest, pnpm + turbo. Lives in `@invariance/design`; reuses `themeToCssEntries` (`runtime/apply.ts`) and `isSafeCssTokenValue` (`@invariance/design-schema`).

## Global Constraints

- **Fail-open everywhere.** A role with no vendor variable, an unsafe value, or no DOM ⇒ nothing is written for that entry; the app keeps its own base design. `applyMappedTheme` must never throw on these.
- **Never mutate `applyThemeJsonV2`** (`runtime/apply.ts`) — it writes `--inv-*` verbatim and is shared by the headless/Trial snippet and Nebula. Add a parallel path; do not change the identity path.
- **Reuse `themeToCssEntries` as the source of truth** for which entries to write and in what order — do NOT re-enumerate `theme.theme.roles`/`.slots` independently (apply-order parity is structural, kept in one place).
- **Gate every injected value through `isSafeCssTokenValue`** (`@invariance/design-schema`). The applier may receive an untrusted (fetched/tampered) theme at runtime; an unsafe value is dropped, never written. This is the same value-injection boundary the `--inv-*` path relies on at the schema layer.
- **`:root`-only for MVP.** The binding's `scope` is recorded but NOT yet honored — all writes target `document.documentElement`. Non-`:root` scoped application is deferred (Phase 6). Record scope; do not silently pretend to honor it.
- **Keep `@invariance/design` decoupled from `@invariance/schema`.** The design package depends only on `@invariance/design-schema`. Do NOT add `@invariance/schema` as a dependency. `apply-mapped.ts` defines a local structural binding type; the canonical `VariableRoleMap` (in `@invariance/schema`) is structurally compatible and is passed by the Phase-3 SDK.
- **No font-face loading here.** `applyThemeJsonV2` calls `ensureFontsLoaded`; `applyMappedTheme` does NOT. Font-face loading is a side effect of the full apply lifecycle the Phase-3 SDK composes (fetch → reconcile → apply + fonts). Keeping this applier a pure CSS-variable writer makes it SSR/stub-safe and single-responsibility.
- **Map role names are bare** (`accent`, `surface-0`); the compiler/`themeToCssEntries` keys are `--inv-`-prefixed (`--inv-accent`). The inversion prepends `--inv-` to each binding's role to match (same convention Phase 2b uses).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/design/src/runtime/apply-mapped.ts` (create) | `applyMappedTheme(theme, bindings)` — the role→vendor-variable indirection + value-safety gate; exports `VariableRoleBinding`/`VariableRoleBindings` (structural). |
| `packages/design/src/runtime/apply-mapped.test.ts` (create) | Unit tests (edge cases) + one compiled-theme end-to-end test, using the minimal `document` stub pattern from `apply-v2.test.ts`. |
| `packages/design/src/headless.ts` (modify) | Re-export `applyMappedTheme` + the binding types (the react-free SDK surface Phase 3 imports). |
| `packages/design/src/index.ts` (modify) | Re-export the same on the full package surface. |

Run focused tests with `pnpm -F @invariance/design test apply-mapped`; run the full package suite with `pnpm -F @invariance/design test` and confirm no previously-passing design test regresses.

---

## Task 2.1: `applyMappedTheme` — role → vendor-variable indirection

**Files:**
- Create: `packages/design/src/runtime/apply-mapped.ts`
- Create: `packages/design/src/runtime/apply-mapped.test.ts`
- Modify: `packages/design/src/headless.ts`, `packages/design/src/index.ts`

**Interfaces:**
- Consumes: `themeToCssEntries(theme: ThemeJsonV2): Array<[string, string]>` (`./apply`); `isSafeCssTokenValue(value: string): boolean` (`@invariance/design-schema`); `type ThemeJsonV2` (`../config/types`).
- Produces: `applyMappedTheme(theme: ThemeJsonV2, bindings: VariableRoleBindings): void`; `interface VariableRoleBinding { role: string; scope?: string }`; `type VariableRoleBindings = Record<string, VariableRoleBinding>`. (The Phase-3 SDK passes `@invariance/schema`'s `VariableRoleMap` here — structurally compatible.)

- [ ] **Step 1: Write the failing tests**

Mirror the minimal-`document`-stub harness from `apply-v2.test.ts` (no jsdom dependency).

```ts
// packages/design/src/runtime/apply-mapped.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { applyMappedTheme, type VariableRoleBindings } from './apply-mapped'
import type { ThemeJsonV2 } from '../config/types'

// minimal documentElement stub — captures setProperty calls (avoids jsdom)
const setProps: Record<string, string> = {}
beforeEach(() => {
  for (const k of Object.keys(setProps)) delete setProps[k]
  ;(globalThis as { document?: unknown }).document = {
    documentElement: { style: { setProperty: (k: string, v: string) => { setProps[k] = v } } },
  }
})

const theme: ThemeJsonV2 = {
  version: 2, base_app_version: 'v1',
  theme: {
    roles: {
      '--inv-accent': '#1e3a8a',
      '--inv-surface-0': '#ffffff',
      '--inv-text-primary': '#0a0a0a',
    },
  },
}

const bindings: VariableRoleBindings = {
  '--primary': { role: 'accent', scope: ':root' },
  '--background': { role: 'surface-0', scope: ':root' },
  '--foreground': { role: 'text-primary', scope: ':root' },
}

describe('applyMappedTheme', () => {
  it("writes compiled role VALUES onto the vendor's variable names", () => {
    applyMappedTheme(theme, bindings)
    expect(setProps['--primary']).toBe('#1e3a8a')
    expect(setProps['--background']).toBe('#ffffff')
    expect(setProps['--foreground']).toBe('#0a0a0a')
  })

  it("does NOT write the --inv-* role tokens (only the vendor's names)", () => {
    applyMappedTheme(theme, bindings)
    expect(setProps['--inv-accent']).toBeUndefined()
    expect(setProps['--inv-surface-0']).toBeUndefined()
  })

  it('applies one role value to every vendor var bound to it (many-to-one)', () => {
    applyMappedTheme(theme, { '--primary': { role: 'accent' }, '--brand': { role: 'accent' } })
    expect(setProps['--primary']).toBe('#1e3a8a')
    expect(setProps['--brand']).toBe('#1e3a8a')
  })

  it('skips a role that has no vendor variable (fail-open, no throw)', () => {
    applyMappedTheme(theme, { '--primary': { role: 'accent' } })
    expect(setProps['--primary']).toBe('#1e3a8a')
    expect(setProps['--background']).toBeUndefined()
    expect(Object.keys(setProps)).toEqual(['--primary'])
  })

  it('never injects an unsafe value (CSS-injection gate)', () => {
    const unsafe: ThemeJsonV2 = {
      version: 2, base_app_version: 'v1',
      theme: { roles: { '--inv-accent': 'red; } body { display:none' } } },
    }
    applyMappedTheme(unsafe, { '--primary': { role: 'accent' } })
    expect(setProps['--primary']).toBeUndefined()
  })

  it('is a no-op without a DOM (SSR-safe)', () => {
    ;(globalThis as { document?: unknown }).document = undefined
    expect(() => applyMappedTheme(theme, bindings)).not.toThrow()
  })

  it('injects nothing for an empty map (fail-open)', () => {
    applyMappedTheme(theme, {})
    expect(Object.keys(setProps)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm -F @invariance/design test apply-mapped`
Expected: FAIL — module `./apply-mapped` does not exist.

- [ ] **Step 3: Implement `apply-mapped.ts`**

```ts
// packages/design/src/runtime/apply-mapped.ts
/**
 * Tier-A applier indirection (governed theming, Phase 2).
 *
 * The base apply path (applyThemeJsonV2) writes the compiler's own `--inv-*`
 * role tokens verbatim. Tier A instead redefines the VENDOR's existing CSS
 * variables: we never edit their components, we redefine the variables they
 * already use. This reverses the variable->role map (role -> the vendor
 * variable name(s) bound to it) and writes the compiled role VALUES onto the
 * vendor's variable names. Fail-open by construction: a role with no vendor
 * variable, an unsafe value, or no DOM => nothing is written for that entry,
 * so the app falls back to its own base design.
 */
import type { ThemeJsonV2 } from '../config/types'
import { isSafeCssTokenValue } from '@invariance/design-schema'
import { themeToCssEntries } from './apply'

/** One vendor-variable -> design-role binding. Structurally compatible with
 *  `@invariance/schema`'s `VariableRole` — kept local so the design package stays
 *  decoupled from the platform schema; the Phase-3 SDK passes the real
 *  VariableRoleMap, which satisfies this shape. */
export interface VariableRoleBinding {
  /** Bare design-role name, e.g. "accent", "surface-0" (NO `--inv-` prefix). */
  role: string
  /** CSS scope the variable is defined in. Recorded; MVP applies at :root only. */
  scope?: string
}

/** Vendor CSS variable name (e.g. "--primary") -> the role it drives. */
export type VariableRoleBindings = Record<string, VariableRoleBinding>

const ROLE_TOKEN_PREFIX = '--inv-'

/**
 * Invert the map: role token (`--inv-<role>`) -> the vendor variable name(s)
 * bound to it. Many vendor vars may share one role (all receive the value).
 */
function invertBindings(bindings: VariableRoleBindings): Map<string, string[]> {
  const inverse = new Map<string, string[]>()
  for (const [vendorVar, binding] of Object.entries(bindings)) {
    const token = ROLE_TOKEN_PREFIX + binding.role
    const list = inverse.get(token)
    if (list) list.push(vendorVar)
    else inverse.set(token, [vendorVar])
  }
  return inverse
}

/**
 * Apply a compiled v2 theme by redefining the vendor's variables via the
 * variable->role map, instead of writing `--inv-*` tokens. Reuses
 * themeToCssEntries so apply order matches the base path. SSR-safe no-op;
 * gates every value through isSafeCssTokenValue. MVP writes at :root only
 * (scope is recorded in the binding but not yet honored).
 */
export function applyMappedTheme(theme: ThemeJsonV2, bindings: VariableRoleBindings): void {
  if (typeof document === 'undefined') return
  const inverse = invertBindings(bindings)
  const root = document.documentElement
  for (const [roleToken, value] of themeToCssEntries(theme)) {
    const vendorVars = inverse.get(roleToken)
    if (!vendorVars) continue // role has no vendor variable -> skip (fail-open)
    if (!isSafeCssTokenValue(value)) continue // never inject an unsafe value
    for (const vendorVar of vendorVars) root.style.setProperty(vendorVar, value)
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm -F @invariance/design test apply-mapped`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Add the compiled-theme end-to-end test**

This proves the real `compileTheme` output flows through the applier onto a vendor variable — the Phase-2 exit criterion. **Do NOT invent StyleSpec field values** — reuse a known-good `StyleSpec` literal from an existing compiler test (e.g. `packages/design/src/compiler/compile.test.ts` — copy one its assertions already accept) so the spec is guaranteed valid. The assertion is independent of the spec's exact values: whatever the compiler produces for `--inv-accent` must land on `--primary`.

Append to `apply-mapped.test.ts`:

```ts
import { compileTheme } from '../compiler/compile'
// import a VALID StyleSpec from design-schema and fill it from an existing
// compiler test fixture (do not guess field values):
import { StyleSpecSchema } from '@invariance/design-schema'

describe('applyMappedTheme (compiled theme, end-to-end)', () => {
  it("redefines the vendor's --primary from the compiler's --inv-accent value", () => {
    // Reuse a known-good spec (copy from compiler/compile.test.ts). Example shape
    // only — replace with a spec the compiler test already accepts:
    const spec = StyleSpecSchema.parse(/* a valid StyleSpec literal from compile.test.ts */)
    const compiled = compileTheme(spec)
    const v2: ThemeJsonV2 = {
      version: 2, base_app_version: 'v1',
      theme: { roles: compiled.roles, styleSpec: spec },
    }
    applyMappedTheme(v2, { '--primary': { role: 'accent' } })
    expect(setProps['--primary']).toBe(compiled.roles['--inv-accent'])
  })
})
```

Run: `pnpm -F @invariance/design test apply-mapped`
Expected: PASS. If `StyleSpecSchema.parse` throws, your spec literal is invalid — copy a real one from `compile.test.ts`, don't hand-tune fields.

- [ ] **Step 6: Export from the package barrels**

In `packages/design/src/headless.ts`, add (next to the existing `applyAnyTheme`/`themeToCssEntries` exports):

```ts
export { applyMappedTheme } from './runtime/apply-mapped'
export type { VariableRoleBinding, VariableRoleBindings } from './runtime/apply-mapped'
```

In `packages/design/src/index.ts`, add the same two export lines (next to the existing runtime apply exports).

(Find the existing apply exports first and place these beside them, matching the file's export style.)

- [ ] **Step 7: Run the full design suite (no regressions) + commit**

Run: `pnpm -F @invariance/design test apply-mapped` then `pnpm -F @invariance/design test`
Expected: apply-mapped tests pass; every previously-passing design test still passes (≈466 + the new cases), output pristine.

```bash
git add packages/design/src/runtime/apply-mapped.ts packages/design/src/runtime/apply-mapped.test.ts packages/design/src/headless.ts packages/design/src/index.ts
git commit -m "feat(design): applyMappedTheme — redefine the vendor's CSS vars via the variable→role map (Tier-A applier indirection)"
```

---

## Phase 2 exit criteria

`applyMappedTheme` writes the compiler's role VALUES onto the *vendor's* variable names via the `variable→role` map (proven against both a hand-built and a real `compileTheme` output); it writes only the vendor's names (never `--inv-*`); a role with no vendor var, an unsafe value, an empty map, and a missing DOM each inject nothing (fail-open) — all asserted. `applyThemeJsonV2` is unchanged. `pnpm -F @invariance/design test` green. (Live repaint of a running sample app is verified in Phase 5; per-`scope` application and font-face loading are deferred to Phase 6 / the Phase-3 SDK lifecycle, respectively, and are noted, not silently skipped.)

---

## Self-review (writing-plans checklist)

- **Spec coverage (roadmap Phase 2):** "apply a compiled theme by writing the vendor's variable names via `variableRoleMap`, not `--inv-*`" — Task 2.1 delivers `applyMappedTheme` (Step 3) reusing `themeToCssEntries`, with map inversion + many-to-one + role-with-no-vendor-var skip (Steps 1/3), the `isSafeCssTokenValue` value gate (Global Constraints + the unsafe-value test), `:root`-only with scope recorded (Global Constraints), fail-open on missing-map/no-DOM (tests), the compiled-theme end-to-end proof (Step 5), and the barrel exports for the Phase-3 SDK (Step 6). SSR-flash for vendor names + per-scope application are explicitly deferred to Phase 6, not assumed free.
- **Placeholder scan:** every code/step is concrete EXCEPT Step 5's StyleSpec literal, which is *intentionally* left to be copied from an existing compiler test (hand-writing a StyleSpec blind risks an invalid spec; the instruction names the source file and the spec-independent assertion). This is a sourcing instruction, not a TBD.
- **Type consistency:** `VariableRoleBinding`/`VariableRoleBindings` are defined in `apply-mapped.ts` (Step 3), consumed by the tests (Step 1) and re-exported (Step 6) under the same names; `applyMappedTheme(theme: ThemeJsonV2, bindings: VariableRoleBindings)` signature is identical across the test, impl, and exports. `themeToCssEntries`/`isSafeCssTokenValue`/`ThemeJsonV2` are consumed with their real signatures (verified in `runtime/apply.ts`, `@invariance/design-schema`, `config/types`).
- **Decoupling check:** no `@invariance/schema` import is introduced (constraint honored via the structural binding type); the design package's own tests import `./apply-mapped` from source, so no build step is needed for this task (external consumers rebuild in Phase 3).
