# Phase 2b — Invariant Enforcement Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the governance fields in `DesignConfig` (`variableRoleMap[var].locked` + a new explicit `value`, and `allowedModes`) *actually bind* — translate them into the design engine's `locked_tokens` + `allowed_modes` constraints so a locked brand variable survives byte-identical through the compiler/verifier and a disallowed mode is rejected, with **zero changes to the compiler or verifier**.

**Architecture:** Locks pin an **explicit value** (decided: the vendor declares the locked brand value; today's `accentLock` is one case). Because the value lives in the config (not in any tenant theme), the whole translation happens at **config-merge time** — no tenant-theme plumbing, no `reconcile`/`load` signature changes. Add one package-level bridge `designConfigConstraints(dc)` in `@invariance/design` that turns the vendor-space `DesignConfig` into the `frontend.design.constraints` block; `deriveConstraints` already hands that block to the compiler + verifier unchanged. Because **both** the load/reconcile path **and** the design-plane authoring pipeline read the same merged `InvarianceConfig` via `deriveConstraints`, wiring the bridge into the config merge makes locks/modes bind at **both** automatically. Reuse the compiler's existing lock application (`compile.ts:80`), accent-ramp seeding (`roles.ts:203-230`), mode throw (`compile.ts:43`), and the verifier's `lockedTokensUntouched`/`accentChromaWithinCap` **unchanged**.

**Tech Stack:** TypeScript (strict, ESM), zod, vitest, pnpm + turbo. Touches `@invariance/schema` (one optional schema field), `@invariance/design` (the new bridge), and `apps/nebula` (wire the live merge to the bridge).

## Global Constraints

- **A lock pins a CONCRETE VALUE.** `locked_tokens` is `Record<token, value>`; the verifier compares **byte-identical** (`compiled-tests.ts:118`) and the compiler **drops empty/whitespace lock values** (`compile.ts:60-66`). A lock with no value pins nothing — so every emitted lock MUST carry a non-empty, safe value.
- **The locked value is explicit** (product decision): it comes from `variableRoleMap[var].value` (new field) or the legacy `accentLock` hex — never from a tenant's current theme and never from probing the base theme at runtime.
- **Compiler + verifier are FROZEN.** Phase 2b only *produces* `DesignConstraints` fields. Do NOT edit `compile.ts`, `roles.ts`, or `compiled-tests.ts`.
- **Empty `allowedModes` means "no restriction", NOT "reject everything."** `compile.ts:43` throws if a non-empty `allowed_modes` doesn't include the spec mode, so an empty `[]` would reject every mode and brick all themes. The bridge MUST omit `allowed_modes` when the input is empty. De-dupe; keep only `'light'`/`'dark'`.
- **Role → token mapping is `'--inv-' + role`, validated against `ROLE_TOKENS`.** `variableRoleMap` roles are bare (`'accent'`); `locked_tokens` keys must be real `--inv-*` tokens. An unmatched role is SKIPPED (no dangling lock — same silent-no-op class of bug we avoid elsewhere).
- **Every lock value passes `isSafeCssTokenValue`** (`@invariance/design-schema`) — the CSS-injection gate, same boundary the apply path uses. An unsafe value is skipped.
- **`@invariance/design` must NOT gain an `@invariance/schema` dependency.** The bridge takes a **structural** `DesignConfig`-like input (local interface); the real `DesignConfig` is structurally compatible and passed by callers (Nebula/console/SDK). (Same decoupling pattern Phase 2 used for `apply-mapped`.)
- **`contrast` is a STRING on the wire** in `frontend.design.constraints` (`'>= 7'`), parsed back to a number by `deriveConstraints`. Emit `contrast` as `'>= ' + n`. `allowed_modes`/`locked_tokens` are NOT string-encoded — pass array/Record as-is.
- **One lock model, not three.** `accentLock` and `variableRoleMap` locks both funnel through the single bridge into one `locked_tokens` output. `accentLock` (legacy explicit-accent input) wins on `--inv-accent` (applied last), preserving today's behavior. A value-pinned `--inv-accent` lock automatically inherits the verifier's existing accent chroma-cap exemption (`compiled-tests.ts:338`, keyed on the literal `--inv-accent`).
- **Known edge (document, don't fix here):** only `--inv-accent` has a verifier exemption. A locked NON-accent color whose declared value fails a contrast pair makes `verifyV2.contrastPairsCheck` fail → `reconcileStoredTheme` recompiles (lock reproduces) → re-verify fails → **drops that tenant theme to base** (fail-open, not a hang). In practice `variableRoleMap` from Phase 1 carries only color roles, and the accent is the safe headline lock. Up-front validation of a locked value against the contrast floor is a Phase-4/Console concern.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/schema/src/design-config.ts` (modify) | Add optional `value?: string` to `VariableRoleSchema` — the explicit locked brand value. |
| `packages/schema/test/design-config.test.ts` (modify) | Assert `value` round-trips and stays optional (back-compat). |
| `packages/design/src/config/design-config-constraints.ts` (create) | `designConfigConstraints(dc)` — the (A)→constraints-block bridge: contrast floor, chroma cap, value-pinned locks (variableRoleMap + accentLock), allowed modes. Structural input type. |
| `packages/design/src/config/design-config-constraints.test.ts` (create) | Unit tests for every branch + an end-to-end test (bridge → `deriveConstraints` → `compileTheme`/`verifyV2`) proving locks/modes bind. |
| `packages/design/src/index.ts` + `packages/design/src/server.ts` (modify) | Export `designConfigConstraints` + its types (server barrel = control-plane/SSR; index = full surface). |
| `apps/nebula/src/lib/dev-config.ts` (modify) | Extend `DevConfigOverlay` with `variableRoleMap` + `allowedModes`; delegate the constraints computation in `mergeInvarianceConfig` to `designConfigConstraints` (keep `pageLevels`/`lockedSections` handling). |
| `apps/nebula/test/...` or alongside dev-config (create/modify) | Assert a `DesignConfig` overlay with a locked var + allowedModes flows through `mergeInvarianceConfig` → the merged constraints carry the lock + modes. |

Focused test commands: `pnpm -F @invariance/schema test design-config`, `pnpm -F @invariance/design test design-config-constraints`, plus the Nebula test command for Task 2b.3 (match the package's existing test invocation).

---

## Task 2b.1: Schema — explicit lock `value` on `VariableRole`

**Files:**
- Modify: `packages/schema/src/design-config.ts`
- Modify: `packages/schema/test/design-config.test.ts`

**Interfaces:**
- Produces: `VariableRoleSchema` gains `value?: string` (the explicit locked brand value; when `locked: true`, this is what gets pinned). `type VariableRole` now includes `value?: string`.

- [ ] **Step 1: Write the failing test**

Add to `packages/schema/test/design-config.test.ts`:

```ts
it("carries an explicit lock value and keeps it optional (back-compat)", () => {
  const cfg = DesignConfigSchema.parse({
    variableRoleMap: {
      "--primary": { role: "accent", scope: ":root", locked: true, value: "#4F46E5" },
      "--background": { role: "surface-0" }, // no value — still valid
    },
  });
  expect(cfg.variableRoleMap!["--primary"]).toEqual({
    role: "accent", scope: ":root", locked: true, value: "#4F46E5",
  });
  // unset value must not appear (so existing { role, scope, locked } shapes are unchanged)
  expect(cfg.variableRoleMap!["--background"]).toEqual({
    role: "surface-0", scope: ":root", locked: false,
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -F @invariance/schema test design-config`
Expected: FAIL — `value` is stripped (the first assertion's `value` is missing).

- [ ] **Step 3: Add the field**

In `packages/schema/src/design-config.ts`, add to `VariableRoleSchema` (after `locked`):

```ts
  /** Explicit brand value pinned when locked:true (e.g. "#4F46E5"). The verifier
   *  compares byte-identical; set by the vendor (pre-filled from the discovered
   *  base at onboarding). Absent ⇒ this variable contributes no lock. */
  value: z.string().min(1).optional(),
```

(Leave `role`/`scope`/`locked` unchanged. `value` is optional with no default, so entries without it parse to the existing `{ role, scope, locked }` shape — the Phase-0 tests still pass.)

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm -F @invariance/schema test design-config`
Expected: PASS (new case + the three Phase-0 cases unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/design-config.ts packages/schema/test/design-config.test.ts
git commit -m "feat(schema): VariableRole.value — explicit pinned value for locked brand variables"
```

---

## Task 2b.2: The bridge — `designConfigConstraints` (the core)

**Files:**
- Create: `packages/design/src/config/design-config-constraints.ts`
- Create: `packages/design/src/config/design-config-constraints.test.ts`
- Modify: `packages/design/src/index.ts`, `packages/design/src/server.ts`

**Interfaces:**
- Consumes: `isSafeCssTokenValue`, `ROLE_TOKENS` (both from `@invariance/design-schema`); `deriveConstraints` (`../config/derive-constraints`), `compileTheme` (`../compiler/compile`), `verifyV2` (`../verify/compiled-tests`) — for tests only.
- Produces: `designConfigConstraints(dc: DesignConfigConstraintsInput): DerivedConstraintsBlock`; `interface DesignConfigConstraintsInput` (structural DesignConfig mirror); `interface DerivedConstraintsBlock` (the `frontend.design.constraints` additions: `{ contrast?: string; accent_chroma_max?: number; locked_tokens?: Record<string,string>; allowed_modes?: Array<'light'|'dark'> }`).

- [ ] **Step 1: Confirm the imports resolve, then write the failing tests**

First confirm `ROLE_TOKENS` and `isSafeCssTokenValue` are exported from `@invariance/design-schema` (grep the package index). If `ROLE_TOKENS` is only re-exported via `../compiler/roles`, import it from there instead — but prefer `@invariance/design-schema`. Note both import paths resolve to the same symbols.

Create `packages/design/src/config/design-config-constraints.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { designConfigConstraints, type DesignConfigConstraintsInput } from './design-config-constraints'
import { deriveConstraints } from './derive-constraints'
import { compileTheme, InvalidStyleSpecError } from '../compiler/compile'
import { verifyV2 } from '../verify/compiled-tests'
import type { InvarianceConfig, ThemeJsonV2 } from './types'

describe('designConfigConstraints (unit)', () => {
  it('maps contrastFloor → contrast string and chromaCap → accent_chroma_max', () => {
    const b = designConfigConstraints({ contrastFloor: 7, chromaCap: 0.18 })
    expect(b.contrast).toBe('>= 7')
    expect(b.accent_chroma_max).toBe(0.18)
  })

  it('out-of-range contrastFloor/chromaCap are ignored', () => {
    const b = designConfigConstraints({ contrastFloor: 99, chromaCap: 0.9 })
    expect(b.contrast).toBeUndefined()
    expect(b.accent_chroma_max).toBeUndefined()
  })

  it('value-pins a locked variableRoleMap entry into locked_tokens by --inv-<role>', () => {
    const b = designConfigConstraints({
      variableRoleMap: { '--primary': { role: 'accent', locked: true, value: '#123456' } },
    })
    expect(b.locked_tokens).toEqual({ '--inv-accent': '#123456' })
  })

  it('skips a locked entry with no value (cannot pin)', () => {
    const b = designConfigConstraints({
      variableRoleMap: { '--primary': { role: 'accent', locked: true } },
    })
    expect(b.locked_tokens).toBeUndefined()
  })

  it('skips a locked entry whose role is not a real --inv-* token', () => {
    const b = designConfigConstraints({
      variableRoleMap: { '--x': { role: 'not-a-role', locked: true, value: '#123456' } },
    })
    expect(b.locked_tokens).toBeUndefined()
  })

  it('skips an unsafe lock value (CSS-injection gate)', () => {
    const b = designConfigConstraints({
      variableRoleMap: { '--primary': { role: 'accent', locked: true, value: 'red; } body{}' } },
    })
    expect(b.locked_tokens).toBeUndefined()
  })

  it('does NOT lock an unlocked entry', () => {
    const b = designConfigConstraints({
      variableRoleMap: { '--primary': { role: 'accent', locked: false, value: '#123456' } },
    })
    expect(b.locked_tokens).toBeUndefined()
  })

  it('accentLock wins on --inv-accent (one model, applied last)', () => {
    const b = designConfigConstraints({
      accentLock: '#aaaaaa',
      variableRoleMap: { '--primary': { role: 'accent', locked: true, value: '#123456' } },
    })
    expect(b.locked_tokens).toEqual({ '--inv-accent': '#aaaaaa' })
  })

  it('maps allowedModes, de-duped; empty array means no restriction (omitted)', () => {
    expect(designConfigConstraints({ allowedModes: ['light', 'light', 'dark'] }).allowed_modes).toEqual(['light', 'dark'])
    expect(designConfigConstraints({ allowedModes: [] }).allowed_modes).toBeUndefined()
    expect(designConfigConstraints({}).allowed_modes).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -F @invariance/design test design-config-constraints`
Expected: FAIL — module `./design-config-constraints` does not exist.

- [ ] **Step 3: Implement the bridge**

```ts
// packages/design/src/config/design-config-constraints.ts
/**
 * Phase 2b — vendor-space DesignConfig → design-engine constraint block.
 *
 * The control-plane DesignConfig carries governance intent (locked brand
 * variables with explicit values, an allowed light/dark set, a chroma cap, a
 * contrast floor). The compiler + verifier enforce constraints in `--inv-*`
 * role-token space via `DesignConstraints`. This is the single bridge that
 * translates the former into the `frontend.design.constraints` block that
 * `deriveConstraints` then hands to the compiler/verifier UNCHANGED.
 *
 * Locks pin an EXPLICIT value (the verifier compares byte-identical): the new
 * variableRoleMap entry.value, or the legacy accentLock hex (one model — accent
 * lock wins on --inv-accent). allowedModes narrows the allowed set (empty = no
 * restriction, never "reject everything").
 */
import { isSafeCssTokenValue, ROLE_TOKENS } from '@invariance/design-schema'

/** Structural mirror of @invariance/schema's DesignConfig (the governance fields
 *  that become constraints). Kept local so @invariance/design stays decoupled
 *  from @invariance/schema; the real DesignConfig is structurally compatible. */
export interface DesignConfigConstraintsInput {
  /** Legacy explicit accent brand hex; pins --inv-accent (wins over a map lock). */
  accentLock?: string | null
  /** Caps accent OKLCH chroma (0.10–0.25). */
  chromaCap?: number
  /** Minimum WCAG contrast ratio (1–21); the compiler may only raise targets. */
  contrastFloor?: number
  /** Modes customization may use; empty/absent = unrestricted. */
  allowedModes?: Array<'light' | 'dark'>
  /** Vendor var → role binding; entries with locked:true + value get pinned. */
  variableRoleMap?: Record<string, { role: string; scope?: string; locked?: boolean; value?: string }>
}

/** Additions for InvarianceConfig.frontend.design.constraints (the (B)-side block). */
export interface DerivedConstraintsBlock {
  contrast?: string
  accent_chroma_max?: number
  locked_tokens?: Record<string, string>
  allowed_modes?: Array<'light' | 'dark'>
}

const ROLE_TOKEN_SET: ReadonlySet<string> = new Set(ROLE_TOKENS)
const HEX_RE = /^#[0-9a-f]{6}$/i

export function designConfigConstraints(dc: DesignConfigConstraintsInput): DerivedConstraintsBlock {
  const out: DerivedConstraintsBlock = {}

  // Contrast floor → '>= n' STRING (deriveConstraints parses it back to a number).
  if (typeof dc.contrastFloor === 'number' && Number.isFinite(dc.contrastFloor) && dc.contrastFloor >= 1 && dc.contrastFloor <= 21) {
    out.contrast = '>= ' + dc.contrastFloor
  }
  // Chroma cap → accent_chroma_max.
  if (typeof dc.chromaCap === 'number' && Number.isFinite(dc.chromaCap) && dc.chromaCap >= 0.1 && dc.chromaCap <= 0.25) {
    out.accent_chroma_max = dc.chromaCap
  }

  // Allowed modes: de-dupe, keep only light/dark; EMPTY = no restriction (omit),
  // because compile.ts throws on a mode not in a non-empty allowed_modes.
  if (Array.isArray(dc.allowedModes)) {
    const modes = [...new Set(dc.allowedModes.filter((m) => m === 'light' || m === 'dark'))]
    if (modes.length > 0) out.allowed_modes = modes
  }

  // Locked tokens (explicit values). variableRoleMap entries first, then accentLock
  // last so the legacy explicit-accent input wins on --inv-accent (one model).
  const locks: Record<string, string> = {}
  for (const entry of Object.values(dc.variableRoleMap ?? {})) {
    if (!entry || entry.locked !== true) continue
    const value = entry.value
    if (typeof value !== 'string' || !value.trim() || !isSafeCssTokenValue(value)) continue
    const token = '--inv-' + entry.role
    if (!ROLE_TOKEN_SET.has(token)) continue // role not a real --inv-* token → skip (no dangling lock)
    locks[token] = value
  }
  if (typeof dc.accentLock === 'string' && HEX_RE.test(dc.accentLock)) {
    locks['--inv-accent'] = dc.accentLock
  }
  if (Object.keys(locks).length > 0) out.locked_tokens = locks

  return out
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm -F @invariance/design test design-config-constraints`
Expected: PASS (all unit cases).

- [ ] **Step 5: Add the end-to-end enforcement test (the roadmap exit, proven in-package)**

This proves the bridge output flows through `deriveConstraints` into the **unchanged** compiler/verifier and actually enforces. **Reuse a valid `StyleSpec` literal from `packages/design/src/compiler/compile.test.ts`** (do NOT invent field values — `StyleSpecSchema.parse`/`compileTheme` will reject an invalid one). Append to the test file:

```ts
// Helper: build an InvarianceConfig whose constraints come from the bridge.
function configFrom(dc: DesignConfigConstraintsInput): InvarianceConfig {
  return { app: 'x', frontend: { design: { constraints: designConfigConstraints(dc) } } }
}

describe('designConfigConstraints (end-to-end through deriveConstraints → compiler/verifier)', () => {
  // const spec = <a valid StyleSpec copied from compiler/compile.test.ts>
  // const darkSpec = { ...spec, mode: 'dark' as const }

  it('a locked accent value survives byte-identical through compile + verify', () => {
    const dc: DesignConfigConstraintsInput = {
      variableRoleMap: { '--primary': { role: 'accent', locked: true, value: '#1E3A8A' } },
    }
    const config = configFrom(dc)
    const constraints = deriveConstraints(config)
    const compiled = compileTheme(spec, constraints)
    expect(compiled.roles['--inv-accent']).toBe('#1E3A8A') // lock won over the computed accent
    const theme: ThemeJsonV2 = { version: 2, base_app_version: 'v1', theme: { roles: compiled.roles, styleSpec: spec } }
    expect(verifyV2(theme, config, constraints).passed).toBe(true)
  })

  it('the verifier rejects a theme whose locked token was changed', () => {
    const dc: DesignConfigConstraintsInput = {
      variableRoleMap: { '--primary': { role: 'accent', locked: true, value: '#1E3A8A' } },
    }
    const config = configFrom(dc)
    const constraints = deriveConstraints(config)
    const compiled = compileTheme(spec, constraints)
    const tampered = { ...compiled.roles, '--inv-accent': '#FFFFFF' }
    const theme: ThemeJsonV2 = { version: 2, base_app_version: 'v1', theme: { roles: tampered, styleSpec: spec } }
    expect(verifyV2(theme, config, constraints).passed).toBe(false)
  })

  it('a disallowed mode is rejected at compile (allowed_modes binds)', () => {
    const constraints = deriveConstraints(configFrom({ allowedModes: ['light'] }))
    expect(() => compileTheme(darkSpec, constraints)).toThrow(InvalidStyleSpecError)
  })

  it('empty allowedModes is treated as unrestricted (no throw)', () => {
    const constraints = deriveConstraints(configFrom({ allowedModes: [] }))
    expect(constraints.allowed_modes).toBeUndefined()
    expect(() => compileTheme(darkSpec, constraints)).not.toThrow()
  })
})
```

Run: `pnpm -F @invariance/design test design-config-constraints`
Expected: PASS. (If `compileTheme`/`StyleSpecSchema` rejects your spec, copy a real one from `compile.test.ts`.) Confirm `InvalidStyleSpecError` is exported from `../compiler/compile` (it is — `compile.ts`); if the throw isn't that class, assert `.toThrow()` without the constructor.

- [ ] **Step 6: Export the bridge**

In `packages/design/src/server.ts` (control-plane/SSR surface) and `packages/design/src/index.ts` (full surface), add next to the existing config exports:

```ts
export { designConfigConstraints } from './config/design-config-constraints'
export type { DesignConfigConstraintsInput, DerivedConstraintsBlock } from './config/design-config-constraints'
```

(Grep each barrel for the existing `deriveConstraints` export and place these beside it. The server barrel matters: the control-plane authoring path may later consume this.)

- [ ] **Step 7: Full design suite (no regressions) + commit**

Run: `pnpm -F @invariance/design test design-config-constraints` then `pnpm -F @invariance/design test`
Expected: new tests pass; every previously-passing design test still passes; output pristine.

```bash
git add packages/design/src/config/design-config-constraints.ts packages/design/src/config/design-config-constraints.test.ts packages/design/src/index.ts packages/design/src/server.ts
git commit -m "feat(design): designConfigConstraints — value-pinned locks + allowed modes from DesignConfig (Phase 2b enforcement bridge)"
```

---

## Task 2b.3: Wire the live merge to the bridge (one lock model in Nebula's path)

**Files:**
- Modify: `apps/nebula/src/lib/dev-config.ts`
- Modify/Create: a colocated test for `mergeInvarianceConfig` (match Nebula's existing test layout; if none exists for dev-config, create `apps/nebula/src/lib/dev-config.test.ts`).

**Interfaces:**
- Consumes: `designConfigConstraints` + `DesignConfigConstraintsInput` from `@invariance/design`.
- Produces: `DevConfigOverlay` gains `variableRoleMap?` + `allowedModes?`; `mergeInvarianceConfig` now stamps value-pinned locks + allowed modes (via the bridge) into `frontend.design.constraints`.

- [ ] **Step 1: Write the failing test**

Create/append `apps/nebula/src/lib/dev-config.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mergeInvarianceConfig } from './dev-config'
import { invarianceConfig } from './invariance-config'

describe('mergeInvarianceConfig — variableRoleMap locks + allowedModes', () => {
  it('stamps a value-pinned lock and narrows allowed modes into constraints', () => {
    const merged = mergeInvarianceConfig(invarianceConfig, {
      variableRoleMap: { '--primary': { role: 'accent', scope: ':root', locked: true, value: '#1E3A8A' } },
      allowedModes: ['light'],
    })
    const c = merged.frontend?.design?.constraints
    expect(c?.locked_tokens?.['--inv-accent']).toBe('#1E3A8A')
    expect(c?.allowed_modes).toEqual(['light'])
  })

  it('still maps accentLock (legacy) and preserves base constraints', () => {
    const merged = mergeInvarianceConfig(invarianceConfig, { accentLock: '#AABBCC' })
    expect(merged.frontend?.design?.constraints?.locked_tokens?.['--inv-accent']).toBe('#AABBCC')
    // base accent_chroma_max from invariance-config.ts survives the merge
    expect(merged.frontend?.design?.constraints?.accent_chroma_max).toBe(0.18)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run the Nebula test command (e.g. `pnpm -F nebula test dev-config` — confirm the package name from `apps/nebula/package.json`).
Expected: FAIL — `variableRoleMap`/`allowedModes` are dropped (locked_tokens/allowed_modes absent).

- [ ] **Step 3: Extend the overlay + delegate to the bridge**

In `apps/nebula/src/lib/dev-config.ts`:

1. Import the bridge:
```ts
import { designConfigConstraints, type DesignConfigConstraintsInput } from '@invariance/design'
```

2. Add the two fields to `DevConfigOverlay`:
```ts
  // vendor var → role binding; entries with locked:true + value pin a brand value
  variableRoleMap?: DesignConfigConstraintsInput['variableRoleMap']
  // modes customization may use; empty/absent = unrestricted
  allowedModes?: Array<'light' | 'dark'>
```

3. Replace the inline `accentLock`/`chromaCap`/`contrastFloor` → `constraintOverrides` block (the three `if` blocks at lines ~50-63) with a single delegation, keeping the same accumulate-then-spread structure:
```ts
  // All constraint governance (accent lock, value-pinned locks, chroma cap,
  // contrast floor, allowed modes) is derived by the shared package bridge —
  // one lock model, reused by the console + SDK.
  const constraintOverrides = designConfigConstraints(overlay)
```
Then keep the existing `if (Object.keys(constraintOverrides).length > 0) { … merge into merged.frontend.design.constraints … }` block, BUT ensure `locked_tokens` is merged with a NESTED spread so a base lock isn't clobbered:
```ts
  if (Object.keys(constraintOverrides).length > 0) {
    const design = { ...merged.frontend?.design }
    design.constraints = {
      ...design.constraints,
      ...constraintOverrides,
      ...(constraintOverrides.locked_tokens
        ? { locked_tokens: { ...design.constraints?.locked_tokens, ...constraintOverrides.locked_tokens } }
        : {}),
    }
    merged.frontend!.design = design
  }
```
Leave `pageLevels` and `lockedSections` handling exactly as-is (they are not constraints — they map to `frontend.pages` / `frontend.structure`). The `HEX_RE` const and the now-removed inline range checks live in the bridge now; delete the dead `HEX_RE`/inline checks from dev-config.ts if nothing else uses them.

- [ ] **Step 4: Rebuild the design package (REQUIRED — Nebula imports the built `dist`)**

Nebula resolves `@invariance/design` to `./dist`, so the `designConfigConstraints` export added in Task 2b.2 is NOT visible to Nebula until the package is rebuilt. Run:
```bash
pnpm -F @invariance/design build
```
Expected: clean `tsc` build. Without this, the Nebula test fails to resolve the import.

- [ ] **Step 5: Run it to verify it passes**

Run the Nebula test command for dev-config.
Expected: PASS (both cases). Then run the full Nebula unit suite to confirm no regression in existing `mergeInvarianceConfig` behavior (pageLevels, lockedSections, accentLock, chromaCap, contrastFloor).

- [ ] **Step 6: Commit**

```bash
git add apps/nebula/src/lib/dev-config.ts apps/nebula/src/lib/dev-config.test.ts
git commit -m "feat(nebula): merge DesignConfig locks + allowedModes via the shared bridge (Phase 2b live wiring)"
```

---

## Phase 2b exit criteria

A `variableRoleMap` entry with `locked: true` + an explicit `value` pins `locked_tokens['--inv-<role>']`, and that value survives **byte-identical** through `compileTheme` and `verifyV2` (a tampered theme is rejected) — proven end-to-end through `deriveConstraints` with **no compiler/verifier edits**. A disallowed mode throws at compile; an empty `allowedModes` is treated as unrestricted. `accentLock` and `variableRoleMap` locks funnel through one bridge into one `locked_tokens` output (accent lock wins on `--inv-accent`, inheriting the existing chroma-cap exemption). Nebula's live `mergeInvarianceConfig` stamps these into `frontend.design.constraints`, so locks/modes bind at **both** load/reconcile and design-plane authoring (both read the merged config via `deriveConstraints`). `pnpm -F @invariance/schema test`, `pnpm -F @invariance/design test`, and the Nebula unit suite are green.

**Deferred (noted, not silently skipped):** up-front validation of a locked value against the contrast floor (a locked non-accent color that fails a contrast pair drops that tenant theme to base on reconcile — fail-open) is a Phase-4/Console concern; the control-plane signed-bundle authoring path (`designConstraintsFromManifest`, Tier-C) is not wired to `DesignConfig` (out of Tier-A scope); migrating `accentLock` away entirely (vs. funneling it through the bridge) is left for when the Console moves to a per-variable lock table (Phase 4).

---

## Self-review (writing-plans checklist)

- **Spec coverage (roadmap Phase 2b + the four sub-problems):** value-pinning (decided: explicit `value`, Task 2b.1 schema + 2b.2 bridge); role-name→token mapping + `ROLE_TOKENS` validation (2b.2); empty-`allowedModes` normalization (2b.2 + test); the exact `--inv-accent` exemption preserved (accent lock lands in `locked_tokens['--inv-accent']`, verifier unchanged); one lock model (accentLock funnels through the bridge, 2b.2 + 2b.3); enforcement at both authoring + load/reconcile (both read the merged config via `deriveConstraints` — wired in 2b.3, proven in 2b.2's e2e). The contrast-loop edge for non-accent locks is documented as a known fail-open drop, not silently skipped.
- **Placeholder scan:** all code is concrete except the e2e `StyleSpec` literal (Task 2b.2 Step 5), intentionally sourced from `compile.test.ts` (hand-writing a StyleSpec blind risks an invalid spec) — a sourcing instruction, not a TBD. The Nebula test command is parameterized on the real package name (implementer confirms from `package.json`).
- **Type consistency:** `DesignConfigConstraintsInput`/`DerivedConstraintsBlock` are defined in `design-config-constraints.ts` (2b.2), re-exported (2b.2 Step 6), and consumed by Nebula (2b.3) under the same names; `VariableRole.value?: string` (2b.1) is the field the bridge reads as `entry.value`. The bridge's `DerivedConstraintsBlock` fields exactly match `InvarianceConfig.frontend.design.constraints` (`contrast: string`, `accent_chroma_max: number`, `locked_tokens: Record<string,string>`, `allowed_modes: Array<'light'|'dark'>`), so it merges in without coercion. `'--inv-' + role` is validated against `ROLE_TOKENS` consistently.
- **Decoupling:** no `@invariance/schema` import added to `@invariance/design` (structural `DesignConfigConstraintsInput`); the design package's own tests import from source, so no build is needed for 2b.1/2b.2. Nebula (an app that already depends on `@invariance/design`) imports the bridge from the built package surface — confirm `pnpm -F @invariance/design build` is run before the Nebula test if Nebula resolves `@invariance/design` to `dist` (same dist caveat as Phase 1/2).
