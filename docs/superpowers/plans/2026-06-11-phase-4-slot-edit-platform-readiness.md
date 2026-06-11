# Phase 4: Slot-Edit Micro-Mutations + Builder Cleanup + Platform Readiness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SLOT_F1 requests ("make the sidebar blue") get a dedicated micro-mutation path (one constrained Haiku call + deterministic OKLCH value math + contrast solve); the Builder shrinks to F2/F3/F4 sections only; the v1 pipeline path, the `translateMutationToV2` bridge, and slot.tsx's inline-style machinery are deleted; and four platform-readiness retrofits land (usage hook + injectable base URL, canonical serialization, verify-on-load, `@invariance/schema` extraction).

**Architecture:** Per DESIGN.md 1.9 and Part 5 (read both first). The slot-edit LLM call picks *intent* (target var from an enum, hue, chroma level, lightness move) — never values. Deterministic code anchors lightness to the current resolved value, builds the literal via culori (always `clampChroma` before `formatHex`), and contrast-solves the dependent text token with the existing `solveText`. After this phase every pipeline route is v2-native: stored v1 (or nothing) upgrades once at entry.

**Tech Stack:** TypeScript strict (`exactOptionalPropertyTypes` — use the spread-conditional pattern for optional fields), zod, vitest, culori, raw fetch. Conventions: named exports, no semicolons, single quotes, kebab-case files, colocated tests, comments explain why. Repo root: `/Users/anuraag/invariance`.

**Baseline:** 343 tests green (291 core + 52 scanner) on `main` (the phase-3 `designer-pipeline` branch has been merged and deleted). Work happens on branch `phase-4-slot-edit` cut from `main`.

**Worker context notes:**
- Read DESIGN.md sections 1.9 and Part 5, plus the `oklch-compiler` skill (`.claude/skills/oklch-compiler/SKILL.md`) before Tasks 4-5. culori facts you will need: `converter('oklch')` returns a function; `h` can be `undefined` for achromatic colors (guard `?? 0`); `formatHex` silently clips — always gamut-map first.
- Existing modules you'll consume: `compiler/contrast.ts` (`solveText`), `compiler/style-spec.ts` (`ACCENT_CHROMA`, `DesignConstraints`), `config/upgrade.ts` (`upgradeThemeJson`), `verify/compiled-tests.ts` (`verifyV2(candidate, config, constraints)`), `config/derive-constraints.ts` (`deriveConstraints`), `agent/api.ts` (`callClaude`), `agent/wire-schemas.ts`.
- The structured-outputs wire dialect: NO `minimum`/`maximum`/`minLength`; `additionalProperties: false` on every object; `enum` allowed. zod revalidates after receipt.
- Test count shifts this phase: the v1-path/bridge pipeline tests are deleted *by design* (the features are deleted); everything else stays green. Run the full suite (`pnpm build && pnpm test` at root) before every commit; commit per task and verify with `git log --oneline -2`.

---

### Task 1: API client — injectable base URL + usage hook

Hostability retrofit: the same client must work pointed at Anthropic directly (today) or at a hosted authoring endpoint (later), and report token usage per call (metering-readiness, DESIGN.md Part 5).

**Files:**
- Modify: `packages/core/src/agent/api.ts`
- Modify: `packages/core/src/agent/gatekeeper.ts` (options threading)
- Modify: `packages/core/src/agent/designer.ts` (options threading)
- Modify: `packages/core/src/index.ts` (type exports)
- Test: `packages/core/src/agent/api.test.ts` (append), `packages/core/src/agent/designer.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append to `api.test.ts`, reusing its existing `okResponse`/`baseOpts` helpers)

```ts
describe('callClaude baseUrl + usage', () => {
  it('sends to a custom base URL when provided', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn',
    }))
    await callClaude({ ...baseOpts, fetchFn, baseUrl: 'https://authoring.example.com' })
    expect(fetchFn.mock.calls[0][0]).toBe('https://authoring.example.com/v1/messages')
  })

  it('reports usage when the response includes it', async () => {
    const onUsage = vi.fn()
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn',
      usage: { input_tokens: 120, output_tokens: 45 },
    }))
    await callClaude({ ...baseOpts, fetchFn, onUsage })
    expect(onUsage).toHaveBeenCalledWith({ model: baseOpts.model, inputTokens: 120, outputTokens: 45 })
  })

  it('reports usage even on refusal (tokens were still spent)', async () => {
    const onUsage = vi.fn()
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [], stop_reason: 'refusal', usage: { input_tokens: 80, output_tokens: 2 },
    }))
    await callClaude({ ...baseOpts, fetchFn, onUsage })
    expect(onUsage).toHaveBeenCalledOnce()
  })

  it('does not call onUsage when the response has no usage block', async () => {
    const onUsage = vi.fn()
    const fetchFn = vi.fn().mockResolvedValue(okResponse({
      content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn',
    }))
    await callClaude({ ...baseOpts, fetchFn, onUsage })
    expect(onUsage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/core && npx vitest run src/agent/api.test.ts`
Expected: FAIL — `baseUrl`/`onUsage` not in `ClaudeCallOptions` (type error) / wrong URL.

- [ ] **Step 3: Implement in `api.ts`**

Add above `ClaudeCallOptions`:

```ts
export interface UsageEvent {
  model: string
  inputTokens: number
  outputTokens: number
}
export type UsageHandler = (usage: UsageEvent) => void

export const DEFAULT_API_BASE_URL = 'https://api.anthropic.com'
```

Extend `ClaudeCallOptions` with:

```ts
  // Hostability: point the client at a proxy/authoring endpoint instead of the
  // Anthropic API. Metering-readiness: onUsage reports tokens per call.
  baseUrl?: string
  onUsage?: UsageHandler
```

Extend `MessagesResponse` with `usage?: { input_tokens?: number; output_tokens?: number }`. Change the fetch URL to `` `${opts.baseUrl ?? DEFAULT_API_BASE_URL}/v1/messages` ``. Immediately after the successful `res.json()` parse (before the `stop_reason` branches — tokens are spent even on refusal/truncation):

```ts
  if (data.usage && opts.onUsage) {
    opts.onUsage({
      model: opts.model,
      inputTokens: data.usage.input_tokens ?? 0,
      outputTokens: data.usage.output_tokens ?? 0,
    })
  }
```

- [ ] **Step 4: Thread through Gatekeeper and Designer**

In `gatekeeper.ts` add to `GatekeeperOptions`: `baseUrl?: string` and `onUsage?: UsageHandler` (import the type from `./api`); pass into `callClaude` with the existing spread-conditional pattern:

```ts
    ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
    ...(opts.onUsage ? { onUsage: opts.onUsage } : {}),
```

Same two fields on `DesignerInput` in `designer.ts`, passed the same way (`input.baseUrl` / `input.onUsage`). Append one test to `designer.test.ts` (reuse its existing mock-fetch helper pattern): call `callDesigner` with `baseUrl: 'https://proxy.test'` and assert `fetchFn.mock.calls[0][0]` is `'https://proxy.test/v1/messages'`.

In `index.ts` add:

```ts
export type { UsageEvent, UsageHandler } from './agent/api'
```

- [ ] **Step 5: Run to verify pass**

Run: `cd packages/core && npx vitest run src/agent/`
Expected: PASS, all agent tests green.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add injectable base URL and usage hook to the API client"
```

---

### Task 2: Canonical theme.json serialization

Stable bytes: identical themes serialize identically (sorted keys), so future signing/content-addressing is an envelope, not a migration (DESIGN.md Part 5).

**Files:**
- Create: `packages/core/src/utils/canonical-json.ts`
- Modify: `packages/core/src/storage/local-storage.ts`, `packages/core/src/storage/api.ts`
- Test: `packages/core/src/utils/canonical-json.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { canonicalStringify } from './canonical-json'

describe('canonicalStringify', () => {
  it('produces identical bytes regardless of key insertion order', () => {
    const a = { version: 2, theme: { slots: { x: '1' }, roles: { b: '2', a: '3' } } }
    const b = { theme: { roles: { a: '3', b: '2' }, slots: { x: '1' } }, version: 2 }
    expect(canonicalStringify(a)).toBe(canonicalStringify(b))
  })

  it('preserves array order and round-trips losslessly', () => {
    const doc = { layout: { pages: { '/': { sections: ['hero', 'grid'], hidden: [] } } } }
    expect(JSON.parse(canonicalStringify(doc))).toEqual(doc)
    expect(canonicalStringify(doc)).toContain('["hero","grid"]')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/core && npx vitest run src/utils/canonical-json.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// Canonical JSON: recursively sorted object keys so identical documents are
// byte-identical. Future signing/content-addressing depends on stable bytes;
// adopting it now makes that an envelope later, not a data migration.
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) sorted[key] = canonicalize(record[key])
    return sorted
  }
  return value
}
```

In `local-storage.ts` `saveTheme`, replace `JSON.stringify(theme)` with `canonicalStringify(theme)` (import from `'../utils/canonical-json'`). In `storage/api.ts` `saveTheme`, replace `JSON.stringify({ userId, appId, theme })` with `canonicalStringify({ userId, appId, theme })`.

- [ ] **Step 4: Run to verify pass**

Run: `cd packages/core && npx vitest run src/utils/ src/storage/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Serialize theme.json canonically (sorted keys, stable bytes)"
```

---

### Task 3: Verify-on-load (+ lockedTokensUntouched refinement)

Stored bytes are untrusted (localStorage is user-editable; an api backend can drift). Re-run the deterministic verifier before applying — integrity net, NOT a permission system (DESIGN.md Part 5). One verifier refinement is required first: `lockedTokensUntouched` currently fails any roles-less theme when `locked_tokens` is configured, which would wrongly reject precision-edit-only themes at load (and block Task 5's slot edits for fresh users).

**Files:**
- Modify: `packages/core/src/verify/compiled-tests.ts` (lockedTokensUntouched)
- Create: `packages/core/src/runtime/load-theme.ts`
- Modify: `packages/core/src/context/provider.tsx`
- Test: `packages/core/src/verify/compiled-tests.test.ts` (append), `packages/core/src/runtime/load-theme.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `compiled-tests.test.ts` (follow its existing fixture style):

```ts
it('lockedTokensUntouched passes for a roles-less theme (precision edits cannot touch a lock)', () => {
  const theme: ThemeJsonV2 = {
    version: 2, base_app_version: 'v1',
    theme: { roles: {}, slots: { '--inv-sidebar-bg': '#123456' } },
  }
  const result = verifyV2(theme, { app: 'test' }, { locked_tokens: { '--inv-accent': '#e94560' } })
  const locked = result.results.find((r) => r.name === 'lockedTokensUntouched')
  expect(locked?.passed).toBe(true)
})
```

Create `load-theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prepareStoredTheme } from './load-theme'
import type { ThemeJson, ThemeJsonV2, InvarianceConfig } from '../config/types'

const lockedConfig: InvarianceConfig = {
  app: 'test',
  frontend: { design: { constraints: { locked_tokens: { '--inv-accent': '#e94560' } } } },
}

describe('prepareStoredTheme', () => {
  it('upgrades a v1 doc and returns it ready to apply', () => {
    const v1: ThemeJson = {
      version: 1, base_app_version: 'v1',
      theme: { globals: { '--inv-sidebar-bg': '#123456' } },
    }
    const prepared = prepareStoredTheme(v1, { app: 'test' })
    expect(prepared.ok).toBe(true)
    if (prepared.ok) expect((prepared.theme as ThemeJsonV2).theme?.slots?.['--inv-sidebar-bg']).toBe('#123456')
  })

  it('rejects a stored theme whose roles contradict a developer lock', () => {
    const tampered: ThemeJsonV2 = {
      version: 2, base_app_version: 'v1',
      theme: { roles: { '--inv-accent': '#00ff00' }, slots: {} },
    }
    const prepared = prepareStoredTheme(tampered, lockedConfig)
    expect(prepared.ok).toBe(false)
    if (!prepared.ok) expect(prepared.failures.join(' ')).toContain('lockedTokensUntouched')
  })

  it('accepts a precision-edit-only theme under a locked-token config', () => {
    const precisionOnly: ThemeJsonV2 = {
      version: 2, base_app_version: 'v1',
      theme: { roles: {}, slots: { '--inv-sidebar-bg': '#123456' } },
    }
    expect(prepareStoredTheme(precisionOnly, lockedConfig).ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/core && npx vitest run src/verify/compiled-tests.test.ts src/runtime/load-theme.test.ts`
Expected: FAIL — locked check fails on empty roles; `load-theme` module not found.

- [ ] **Step 3: Implement the lockedTokensUntouched refinement**

In `compiled-tests.ts`, inside `lockedTokensUntouched` right after `const roles = theme?.roles ?? {}`:

```ts
  // A theme with no compiled roles cannot have touched a lock — the locked
  // value still comes from the app's own CSS defaults. Absence only becomes
  // suspicious in a compiled theme (roles present), where a missing locked
  // key means something removed it.
  if (Object.keys(roles).length === 0) {
    return {
      name: 'lockedTokensUntouched',
      passed: true,
      message: 'No roles present — locked tokens untouched by construction',
      severity: 'warning',
      autoFixable: false,
    }
  }
```

(Keep the existing present-but-different and absent-in-non-empty-roles violations unchanged.)

- [ ] **Step 4: Implement `runtime/load-theme.ts`**

```ts
import { upgradeThemeJson } from '../config/upgrade'
import { verifyV2 } from '../verify/compiled-tests'
import { deriveConstraints } from '../config/derive-constraints'
import { isV2Theme } from '../config/types'
import type { AnyThemeJson, InvarianceConfig } from '../config/types'

export type PreparedTheme =
  | { ok: true; theme: AnyThemeJson; warnings: string[] }
  | { ok: false; warnings: string[]; failures: string[] }

// Upgrade + re-verify a stored theme before it is applied. Stored bytes are
// untrusted (localStorage is user-editable; a remote backend can drift) and
// the deterministic verifier is cheap — re-running it here is the integrity
// net. This is NOT a permission system: enforcement happens at authoring time.
export function prepareStoredTheme(raw: AnyThemeJson, config: InvarianceConfig): PreparedTheme {
  const { theme, warnings } = upgradeThemeJson(raw)
  if (!isV2Theme(theme)) return { ok: true, theme, warnings }
  const verification = verifyV2(theme, config, deriveConstraints(config))
  if (verification.passed) return { ok: true, theme, warnings }
  const failures = verification.results.filter((r) => !r.passed).map((r) => `${r.name}: ${r.message}`)
  return { ok: false, warnings, failures }
}
```

- [ ] **Step 5: Rewire the provider**

In `provider.tsx`, replace the body of the load effect so both the success and catch paths go through one helper (drop the direct `upgradeThemeJson` import, add `prepareStoredTheme` from `'../runtime/load-theme'`):

```ts
  useEffect(() => {
    let cancelled = false
    function applyPrepared(raw: AnyThemeJson): void {
      const prepared = prepareStoredTheme(raw, config)
      for (const w of prepared.warnings) console.warn('[invariance] theme upgrade:', w)
      if (!prepared.ok) {
        for (const f of prepared.failures) {
          console.warn('[invariance] stored theme failed verification; using base styling:', f)
        }
        return
      }
      themeStore.setTheme(prepared.theme)
      applyAnyTheme(prepared.theme, config)
    }
    async function loadTheme(): Promise<void> {
      try {
        const stored = await storageBackend.loadTheme(userId, config.app)
        if (cancelled) return
        const raw = stored ?? initialTheme ?? null
        if (raw) applyPrepared(raw)
      } catch (e) {
        console.warn('Failed to load theme.json:', e)
        if (!cancelled && initialTheme) applyPrepared(initialTheme)
      }
    }
    void loadTheme()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

- [ ] **Step 6: Run to verify pass, then full suite**

Run: `cd packages/core && npx vitest run`
Expected: PASS (294+ core tests).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Verify stored themes on load; roles-less themes cannot violate locks"
```

---

### Task 4: Slot-edit value math (pure, no LLM)

The deterministic half of DESIGN.md 1.9's micro-mutation path. The model never picks values: lightness anchors to the current resolved value, chroma comes from the StyleSpec vocabulary, contrast is solved by the existing binary search.

**Files:**
- Create: `packages/core/src/agent/slot-edit.ts` (pure helpers in this task; the agent call lands in Task 5)
- Test: `packages/core/src/agent/slot-edit.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { converter, wcagContrast } from 'culori'
import { resolveSlotVar, buildSlotLiteral, solveDependentText } from './slot-edit'
import type { ThemeJsonV2 } from '../config/types'

const toOklch = converter('oklch')

const theme = (roles: Record<string, string>, slots: Record<string, string>): ThemeJsonV2 => ({
  version: 2, base_app_version: 'v1', theme: { roles, slots },
})

describe('resolveSlotVar', () => {
  it('returns an explicit literal as-is', () => {
    expect(resolveSlotVar('--inv-sidebar-bg', theme({}, { '--inv-sidebar-bg': '#123456' }))).toBe('#123456')
  })
  it('follows a var() reference into roles', () => {
    expect(resolveSlotVar('--inv-sidebar-bg', theme({ '--inv-surface-2': '#1f232c' }, { '--inv-sidebar-bg': 'var(--inv-surface-2)' }))).toBe('#1f232c')
  })
  it('falls back to the conventional default role when no slot entry exists', () => {
    expect(resolveSlotVar('--inv-sidebar-bg', theme({ '--inv-surface-1': '#171a21' }, {}))).toBe('#171a21')
    expect(resolveSlotVar('--inv-sidebar-text', theme({ '--inv-text-primary': '#f2f3f5' }, {}))).toBe('#f2f3f5')
    expect(resolveSlotVar('--inv-sidebar-border', theme({ '--inv-border': '#2a2f3a' }, {}))).toBe('#2a2f3a')
  })
  it('returns null on a fresh theme with no roles', () => {
    expect(resolveSlotVar('--inv-sidebar-bg', theme({}, {}))).toBeNull()
  })
})

describe('buildSlotLiteral', () => {
  it('keeps the current lightness when the move is "same"', () => {
    const current = '#1a1a2e'
    const out = buildSlotLiteral({ hue: 250, chromaLevel: 'medium', lightness: 'same', currentHex: current })
    const lOut = toOklch(out)?.l ?? 0
    const lIn = toOklch(current)?.l ?? 1
    expect(Math.abs(lOut - lIn)).toBeLessThan(0.02)
  })
  it('respects the developer chroma cap', () => {
    const out = buildSlotLiteral({ hue: 250, chromaLevel: 'vivid', lightness: 'same', currentHex: '#888888', chromaMax: 0.05 })
    expect(toOklch(out)?.c ?? 1).toBeLessThanOrEqual(0.051)
  })
  it('neutral chroma produces a gray', () => {
    const out = buildSlotLiteral({ hue: 250, chromaLevel: 'neutral', lightness: 'same', currentHex: '#3355aa' })
    expect(toOklch(out)?.c ?? 1).toBeLessThan(0.005)
  })
  it('clamps lightness moves to the displayable band', () => {
    const out = buildSlotLiteral({ hue: 250, chromaLevel: 'medium', lightness: 'much-lighter', currentHex: '#fefefe' })
    expect(toOklch(out)?.l ?? 2).toBeLessThanOrEqual(0.98)
    const out2 = buildSlotLiteral({ hue: 250, chromaLevel: 'medium', lightness: 'much-darker', currentHex: '#050505' })
    expect(toOklch(out2)?.l ?? 0).toBeGreaterThanOrEqual(0.07)
  })
  it('uses a mid lightness when nothing resolves (fresh theme)', () => {
    const out = buildSlotLiteral({ hue: 250, chromaLevel: 'medium', lightness: 'same', currentHex: null })
    const l = toOklch(out)?.l ?? 0
    expect(l).toBeGreaterThan(0.4)
    expect(l).toBeLessThan(0.7)
  })
})

describe('solveDependentText', () => {
  it('meets the contrast floor against a dark background', () => {
    const solved = solveDependentText('#1b2a4a', '#f2f3f5', 4.5)
    expect(solved.met).toBe(true)
    expect(wcagContrast(solved.hex, '#1b2a4a')).toBeGreaterThanOrEqual(4.5)
  })
  it('meets the contrast floor against a light background', () => {
    const solved = solveDependentText('#e8ecf4', '#0f1117', 4.5)
    expect(solved.met).toBe(true)
    expect(wcagContrast(solved.hex, '#e8ecf4')).toBeGreaterThanOrEqual(4.5)
  })
  it('falls back to near-neutral when the current text value is unparseable', () => {
    const solved = solveDependentText('#1b2a4a', null, 4.5)
    expect(solved.met).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/core && npx vitest run src/agent/slot-edit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers in `slot-edit.ts`**

```ts
import { converter, formatHex, clampChroma, wcagContrast } from 'culori'

import type { ThemeJsonV2 } from '../config/types'
import { ACCENT_CHROMA } from '../compiler/style-spec'
import { solveText } from '../compiler/contrast'

const toOklch = converter('oklch')

// Slot-edit chroma vocabulary: StyleSpec's accent levels plus 'neutral' for
// gray/white/black requests. The model picks a level; this table picks the number.
export const SLOT_CHROMA = { neutral: 0, ...ACCENT_CHROMA } as const
export type SlotChromaLevel = keyof typeof SLOT_CHROMA

// Discrete lightness moves: the model says "darker", arithmetic decides how much.
export const LIGHTNESS_DELTA = {
  'much-darker': -0.3,
  darker: -0.15,
  same: 0,
  lighter: 0.15,
  'much-lighter': 0.3,
} as const
export type SlotLightness = keyof typeof LIGHTNESS_DELTA

// Slot tokens default to role references by convention (CLAUDE.md two-tier
// tokens). When theme.json carries no entry, the value the user actually sees
// is the app stylesheet's default var() — resolve through the same convention.
const DEFAULT_ROLE_FOR_SUFFIX: Record<string, string> = {
  bg: '--inv-surface-1',
  background: '--inv-surface-1',
  text: '--inv-text-primary',
  color: '--inv-text-primary',
  border: '--inv-border',
  accent: '--inv-accent',
}

export function suffixOf(varName: string): string {
  const parts = varName.split('-')
  return parts[parts.length - 1] ?? ''
}

export function defaultRoleFor(varName: string): string {
  return DEFAULT_ROLE_FOR_SUFFIX[suffixOf(varName)] ?? '--inv-surface-1'
}

const VAR_REF = /^var\((--[a-z0-9-]+)\)$/

// Explicit literal > var() ref through roles > conventional default role.
// null when nothing resolves (fresh theme) — callers fall back to mid lightness.
export function resolveSlotVar(varName: string, theme: ThemeJsonV2): string | null {
  const slots = theme.theme?.slots ?? {}
  const roles = theme.theme?.roles ?? {}
  const entry = slots[varName]
  if (entry !== undefined) {
    const ref = VAR_REF.exec(entry)
    const target = ref?.[1]
    if (target === undefined) return entry
    return roles[target] ?? null
  }
  return roles[defaultRoleFor(varName)] ?? null
}

export interface SlotLiteralRequest {
  hue: number
  chromaLevel: SlotChromaLevel
  lightness: SlotLightness
  currentHex: string | null
  chromaMax?: number
}

// Deterministic value construction: lightness anchors to the current resolved
// value so the theme's lightness structure survives the edit; chroma is capped
// by the developer constraint; clampChroma gamut-maps before formatHex.
export function buildSlotLiteral(req: SlotLiteralRequest): string {
  const parsed = req.currentHex ? toOklch(req.currentHex) : undefined
  const baseL = parsed?.l ?? 0.55
  const l = Math.min(0.97, Math.max(0.08, baseL + LIGHTNESS_DELTA[req.lightness]))
  const c = Math.min(SLOT_CHROMA[req.chromaLevel], req.chromaMax ?? Infinity)
  return formatHex(clampChroma({ mode: 'oklch', l, c, h: req.hue }, 'oklch'))
}

export interface DependentTextResult {
  hex: string
  met: boolean
}

// When a slot background changes, its text token must keep meeting the
// developer's contrast floor. Keep the text's current hue character when it
// resolves; chroma stays near-neutral so solved text never outshouts the accent.
export function solveDependentText(
  newBgHex: string,
  currentTextHex: string | null,
  target: number,
): DependentTextResult {
  const parsed = currentTextHex ? toOklch(currentTextHex) : undefined
  const hue = parsed?.h ?? 0
  const chroma = Math.min(parsed?.c ?? 0, 0.04)
  const result = solveText(newBgHex, { hue, chroma, target })
  return { hex: result.hex, met: result.met }
}
```

(`wcagContrast` is imported now because Task 5 uses it in this same file.)

- [ ] **Step 4: Run to verify pass**

Run: `cd packages/core && npx vitest run src/agent/slot-edit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add slot-edit value math: resolution, literal construction, dependent contrast"
```

---

### Task 5: Slot-edit agent call + candidate assembly

The LLM half: one Haiku-class structured-outputs call that picks `targetVar` (enum of the slot's registered variables), hue, chroma level, and lightness move. Everything after the pick is Task 4's arithmetic.

**Files:**
- Modify: `packages/core/src/agent/models.ts` (add `SLOT_EDIT_MODEL`)
- Modify: `packages/core/src/agent/wire-schemas.ts` (add `slotEditWireSchema`)
- Create: `packages/core/src/agent/slot-edit-prompt.ts`
- Modify: `packages/core/src/agent/slot-edit.ts` (add `runSlotEdit`)
- Test: `packages/core/src/agent/slot-edit.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append; follow the file's existing imports plus `vi`, `runSlotEdit`, and `SlotRegistration`)

```ts
import { vi } from 'vitest'
import { runSlotEdit } from './slot-edit'
import type { SlotRegistration } from '../context/registry'

const okReply = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text: JSON.stringify(body) }], stop_reason: 'end_turn' }),
  }) as unknown as Response

// Adjust fields to SlotRegistration's exact shape (read context/registry.ts) —
// the load-bearing field here is cssVariables.
const sidebarReg: SlotRegistration = {
  name: 'sidebar', level: 1, pageName: '', preserve: false,
  alternativesCount: 0, type: 'slot', source: 'page',
  cssVariables: ['--inv-sidebar-bg', '--inv-sidebar-text'],
}

const baseInput = {
  intent: { slotName: 'sidebar', description: 'make the sidebar blue' },
  registry: [sidebarReg],
  config: { app: 'test' },
  constraints: { contrast: 4.5 },
  apiKey: 'k',
}

describe('runSlotEdit', () => {
  it('builds a contrast-solved bg+text micro-mutation', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply({
      targetVar: '--inv-sidebar-bg', hue: 250, chromaLevel: 'medium', lightness: 'same',
      explanation: 'Made the sidebar blue',
    }))
    // Current values come in as slot literals, NOT a partial roles map: a
    // non-empty-but-incomplete roles map would (correctly) fail
    // compilerOutputComplete in verifyV2. Real edits ride on either a complete
    // compiled theme or no roles at all.
    const currentV2 = theme({}, { '--inv-sidebar-bg': '#171a21', '--inv-sidebar-text': '#f2f3f5' })
    const outcome = await runSlotEdit({ ...baseInput, currentV2, fetchFn })
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      const slots = outcome.candidate.theme?.slots ?? {}
      const bg = slots['--inv-sidebar-bg']
      const text = slots['--inv-sidebar-text']
      expect(bg).toMatch(/^#[0-9a-f]{6}$/)
      expect(text).toMatch(/^#[0-9a-f]{6}$/)
      expect(wcagContrast(text!, bg!)).toBeGreaterThanOrEqual(4.5)
      expect(outcome.explanation).toBe('Made the sidebar blue')
    }
  })

  it('rejects a slot with no registered css variables before calling the model', async () => {
    const fetchFn = vi.fn()
    const bare: SlotRegistration = { ...sidebarReg, name: 'bare' }
    delete (bare as Record<string, unknown>).cssVariables
    const outcome = await runSlotEdit({
      ...baseInput, intent: { slotName: 'bare', description: 'make it blue' },
      registry: [bare], currentV2: theme({}, {}), fetchFn,
    })
    expect(outcome.ok).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refuses to shadow a developer lock with a slot literal', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply({
      targetVar: '--inv-sidebar-bg', hue: 250, chromaLevel: 'medium', lightness: 'same',
      explanation: 'Made the sidebar blue',
    }))
    const outcome = await runSlotEdit({
      ...baseInput,
      constraints: { contrast: 4.5, locked_tokens: { '--inv-sidebar-bg': '#101010' } },
      currentV2: theme({}, {}), fetchFn,
    })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('locked')
  })

  it('adjusts a requested text color that cannot read against the current bg', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply({
      targetVar: '--inv-sidebar-text', hue: 250, chromaLevel: 'medium', lightness: 'much-darker',
      explanation: 'Made the sidebar text navy',
    }))
    const currentV2 = theme({}, { '--inv-sidebar-bg': '#0f1117' })
    const outcome = await runSlotEdit({ ...baseInput, currentV2, fetchFn })
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      const text = outcome.candidate.theme?.slots?.['--inv-sidebar-text']
      expect(wcagContrast(text!, '#0f1117')).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('errors politely on an unparseable model reply', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply('not-a-pick'))
    const outcome = await runSlotEdit({ ...baseInput, currentV2: theme({}, {}), fetchFn })
    expect(outcome.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/core && npx vitest run src/agent/slot-edit.test.ts`
Expected: FAIL — `runSlotEdit` not exported.

- [ ] **Step 3: Add the model constant, wire schema, and prompt**

`models.ts` — add:

```ts
export const SLOT_EDIT_MODEL = 'claude-haiku-4-5'
```

`wire-schemas.ts` — add:

```ts
// Slot-edit pick: the model chooses intent, never values. targetVar is an enum
// of the slot's registered variables so an off-list var cannot be emitted.
export function slotEditWireSchema(targetVars: readonly string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['targetVar', 'hue', 'chromaLevel', 'lightness', 'explanation'],
    properties: {
      targetVar: { type: 'string', enum: [...targetVars] },
      hue: { type: 'number' },
      chromaLevel: { type: 'string', enum: ['neutral', 'muted', 'medium', 'vivid'] },
      lightness: { type: 'string', enum: ['much-darker', 'darker', 'same', 'lighter', 'much-lighter'] },
      explanation: { type: 'string' },
    },
  } as const
}
```

Create `slot-edit-prompt.ts`:

```ts
export interface SlotEditPromptInput {
  slotName: string
  variables: Array<{ name: string; currentValue: string | null }>
}

export function buildSlotEditPrompt(input: SlotEditPromptInput): string {
  const varLines = input.variables
    .map((v) => `- ${v.name}${v.currentValue ? ` (currently ${v.currentValue})` : ' (app default)'}`)
    .join('\n')
  return `You translate a user's color request for the "${input.slotName}" slot into a structured color intent. You never output color values — downstream code computes the actual value and solves contrast automatically.

The slot's editable CSS variables:
${varLines}

Rules:
- targetVar: the variable the user means ("sidebar text" -> the -text variable; a plain "make the sidebar blue" -> the -bg variable).
- hue: OKLCH hue degrees for the requested color family (red 25, orange 55, yellow 100, green 145, teal 180, cyan 200, blue 250, indigo 275, purple 300, pink 350). Interpolate for in-between names.
- chromaLevel: neutral (gray/white/black), muted (dusty, soft, washed), medium (plain color words), vivid (bright, neon, hot).
- lightness: a move relative to the current value — "same" unless the user implies a shift (navy -> darker, pastel -> lighter, midnight -> much-darker).
- explanation: one short sentence describing the change, addressed to the user.`
}
```

- [ ] **Step 4: Implement `runSlotEdit`** (append to `slot-edit.ts`)

Add imports at the top of the file:

```ts
import { z } from 'zod'

import type { InvarianceConfig } from '../config/types'
import type { DesignConstraints } from '../compiler/style-spec'
import type { SlotRegistration } from '../context/registry'
import { callClaude, type UsageHandler } from './api'
import { SLOT_EDIT_MODEL } from './models'
import { slotEditWireSchema } from './wire-schemas'
import { buildSlotEditPrompt } from './slot-edit-prompt'
import { verifyV2 } from '../verify/compiled-tests'
```

Then:

```ts
const SlotEditReplySchema = z.object({
  targetVar: z.string(),
  hue: z.number().min(0).max(360),
  chromaLevel: z.enum(['neutral', 'muted', 'medium', 'vivid']),
  lightness: z.enum(['much-darker', 'darker', 'same', 'lighter', 'much-lighter']),
  explanation: z.string().min(1),
})

export interface SlotEditInput {
  intent: { slotName: string; description: string }
  currentV2: ThemeJsonV2
  registry: SlotRegistration[]
  constraints: DesignConstraints
  config: InvarianceConfig
  apiKey: string
  fetchFn?: typeof fetch
  baseUrl?: string
  onUsage?: UsageHandler
}

export type SlotEditOutcome =
  | { ok: true; candidate: ThemeJsonV2; explanation: string }
  | { ok: false; error: string }

const MISUNDERSTOOD = 'Could not understand the color request. Try rephrasing.'

export async function runSlotEdit(input: SlotEditInput): Promise<SlotEditOutcome> {
  const registration = input.registry.find((r) => r.name === input.intent.slotName)
  const vars = registration?.cssVariables ?? []
  if (vars.length === 0) {
    return { ok: false, error: 'This slot does not support style variables yet.' }
  }

  const system = buildSlotEditPrompt({
    slotName: input.intent.slotName,
    variables: vars.map((name) => ({ name, currentValue: resolveSlotVar(name, input.currentV2) })),
  })

  const result = await callClaude({
    apiKey: input.apiKey,
    // Micro-edit: a classification-sized job where latency matters most.
    model: SLOT_EDIT_MODEL,
    system,
    messages: [{ role: 'user', content: input.intent.description }],
    temperature: 0.1,
    maxTokens: 512,
    outputSchema: slotEditWireSchema(vars) as unknown as Record<string, unknown>,
    ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
    ...(input.onUsage ? { onUsage: input.onUsage } : {}),
  })
  if (!result.ok) return { ok: false, error: result.error }

  let raw: unknown
  try {
    raw = JSON.parse(result.text)
  } catch {
    return { ok: false, error: MISUNDERSTOOD }
  }
  const parsed = SlotEditReplySchema.safeParse(raw)
  if (!parsed.success || !vars.includes(parsed.data.targetVar)) {
    return { ok: false, error: MISUNDERSTOOD }
  }
  const pick = parsed.data

  // Deterministic guard: a slot literal would visually shadow a developer lock
  // (slots write to :root after roles), so locked vars are refused outright.
  if (input.constraints.locked_tokens?.[pick.targetVar] !== undefined) {
    return { ok: false, error: 'That value is locked by the developer and cannot be changed.' }
  }

  const currentHex = resolveSlotVar(pick.targetVar, input.currentV2)
  const literal = buildSlotLiteral({
    hue: pick.hue,
    chromaLevel: pick.chromaLevel,
    lightness: pick.lightness,
    currentHex,
    ...(input.constraints.accent_chroma_max !== undefined ? { chromaMax: input.constraints.accent_chroma_max } : {}),
  })

  const target = input.constraints.contrast ?? 4.5
  const newSlots: Record<string, string> = { [pick.targetVar]: literal }
  const suffix = suffixOf(pick.targetVar)

  if (suffix === 'bg' || suffix === 'background') {
    // One coordinated micro-mutation: the sibling text token moves with its bg.
    const textVar = vars.find((v) => ['text', 'color'].includes(suffixOf(v)))
    if (textVar && input.constraints.locked_tokens?.[textVar] === undefined) {
      const solved = solveDependentText(literal, resolveSlotVar(textVar, input.currentV2), target)
      if (!solved.met) {
        return { ok: false, error: 'Could not find an accessible text color for that background. Try a different shade.' }
      }
      newSlots[textVar] = solved.hex
    }
  } else if (suffix === 'text' || suffix === 'color') {
    // The requested text color must read against the current background;
    // adjust its lightness minimally when it falls short.
    const bgVar = vars.find((v) => ['bg', 'background'].includes(suffixOf(v)))
    const bgHex = bgVar ? resolveSlotVar(bgVar, input.currentV2) : null
    if (bgHex) {
      const ratio = wcagContrast(literal, bgHex)
      if (ratio < target) {
        const parsedLiteral = toOklch(literal)
        const solved = solveText(bgHex, { hue: parsedLiteral?.h ?? pick.hue, chroma: parsedLiteral?.c ?? 0, target })
        if (!solved.met) {
          return { ok: false, error: 'That text color cannot reach readable contrast here. Try a different color.' }
        }
        newSlots[pick.targetVar] = solved.hex
      }
    }
  }

  const candidate: ThemeJsonV2 = {
    version: 2,
    base_app_version: input.currentV2.base_app_version,
    theme: {
      roles: { ...(input.currentV2.theme?.roles ?? {}) },
      slots: { ...(input.currentV2.theme?.slots ?? {}), ...newSlots },
      ...(input.currentV2.theme?.styleSpec ? { styleSpec: input.currentV2.theme.styleSpec } : {}),
    },
  }
  if (input.currentV2.content !== undefined) candidate.content = input.currentV2.content
  if (input.currentV2.layout !== undefined) candidate.layout = input.currentV2.layout
  if (input.currentV2.components !== undefined) candidate.components = input.currentV2.components

  const verification = verifyV2(candidate, input.config, input.constraints)
  if (!verification.passed) {
    const failures = verification.results.filter((r) => !r.passed).map((r) => `${r.name}: ${r.message}`)
    return { ok: false, error: `The change failed verification: ${failures.join('; ')}` }
  }

  return { ok: true, candidate, explanation: pick.explanation }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd packages/core && npx vitest run src/agent/slot-edit.test.ts`
Expected: PASS (all Task 4 + Task 5 cases).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add slot-edit micro-mutation agent: constrained pick + contrast solve"
```

---

### Task 6: Builder F2-F4 cleanup + pipeline rewire (one task — they change together)

The Builder loses every styling concern; the pipeline routes SLOT_F1 to `runSlotEdit`, normalizes to v2 at entry, and deletes the v1 path, `mergeTheme`'s v1 use, and `translateMutationToV2`. These cannot land separately without a red intermediate commit, so they are one task.

**Files:**
- Rewrite: `packages/core/src/agent/builder.ts`
- Rewrite: `packages/core/src/agent/pipeline.ts`
- Modify: `packages/core/src/context/provider.tsx` (apiBaseUrl/onUsage props → context)
- Modify: `packages/core/src/panel/customization-overlay.tsx` (PROGRESS_LABELS + context fields)
- Modify: `packages/core/src/index.ts` (export `PipelineContext` if pipeline types are re-exported there)
- Test: `packages/core/src/agent/builder.test.ts` (new), `packages/core/src/agent/pipeline.test.ts` (rewrite affected cases)

- [ ] **Step 1: Read first**

Read the existing `pipeline.test.ts` end to end. Tests that exercise the v1 Builder path or `translateMutationToV2` will be deleted; tests for the THEME route, CLARIFY/REJECT pass-throughs, and retry budgets are kept (adjusted to the new Builder result shape). Reuse its mock-fetch sequencing pattern for the new tests below.

- [ ] **Step 2: Write the failing tests**

Create `builder.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { callBuilder } from './builder'

const okReply = (text: string) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }),
  }) as unknown as Response

const baseInput = {
  currentTheme: null,
  intent: { slotName: 'hero', level: 2, description: 'change the title', requirements: [] },
  slotRegistry: [],
  invariantConfig: { app: 'test' },
}

describe('callBuilder', () => {
  it('returns a sections-only mutation', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply(JSON.stringify({
      mutation: { content: { pages: { '/': { el_001: { text: 'Hi' } } } } },
      explanation: 'Updated title',
    })))
    const outcome = await callBuilder({ ...baseInput, fetchFn }, 'k')
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.mutation.content?.pages['/']?.el_001?.text).toBe('Hi')
      expect(outcome.explanation).toBe('Updated title')
    }
  })

  it('strips any theme key a confused model emits', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply(JSON.stringify({
      mutation: { theme: { slots: { '--inv-x': '#fff' } }, layout: { pages: { '/': { hidden: ['ad'] } } } },
      explanation: 'done',
    })))
    const outcome = await callBuilder({ ...baseInput, fetchFn }, 'k')
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect('theme' in outcome.mutation).toBe(false)
      expect(outcome.mutation.layout?.pages['/']?.hidden).toEqual(['ad'])
    }
  })

  it('extracts JSON from a fenced reply', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply('```json\n{"mutation":{"layout":{"pages":{}}},"explanation":"ok"}\n```'))
    const outcome = await callBuilder({ ...baseInput, fetchFn }, 'k')
    expect(outcome.ok).toBe(true)
  })

  it('surfaces transport failures as errors, not fake successes', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('boom'))
    const outcome = await callBuilder({ ...baseInput, fetchFn }, 'k')
    expect(outcome.ok).toBe(false)
  })

  it('errors when the reply has no mutation', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply('{"explanation":"no mutation here"}'))
    const outcome = await callBuilder({ ...baseInput, fetchFn }, 'k')
    expect(outcome.ok).toBe(false)
  })
})
```

In `pipeline.test.ts`, add (adapting helper names to the file's existing ones):

```ts
it('routes SLOT_F1 to the slot-edit micro-mutation and stores a v2 doc', async () => {
  const fetchFn = vi.fn()
    .mockResolvedValueOnce(okReply(JSON.stringify({
      kind: 'SLOT_F1', slotName: 'sidebar', level: 1,
      description: 'make the sidebar blue', requirements: [],
    })))
    .mockResolvedValueOnce(okReply(JSON.stringify({
      targetVar: '--inv-sidebar-bg', hue: 250, chromaLevel: 'medium', lightness: 'same',
      explanation: 'Made the sidebar blue',
    })))
  // registry entry for 'sidebar' must carry cssVariables — reuse/extend the
  // file's registration fixture.
  const result = await runPipeline('make the sidebar blue', [], contextWith({ fetchFn }))
  expect(result.type).toBe('success')
  const stored = await storageBackend.loadTheme(userId, appId)
  expect(stored && 'theme' in stored && (stored as ThemeJsonV2).theme?.slots?.['--inv-sidebar-bg']).toMatch(/^#[0-9a-f]{6}$/)
})

it('merges Builder sections onto the current v2 doc (fresh user gets v2, never v1)', async () => {
  const fetchFn = vi.fn()
    .mockResolvedValueOnce(okReply(JSON.stringify({
      kind: 'F3', slotName: 'banner', level: 3,
      description: 'hide the banner', requirements: [],
    })))
    .mockResolvedValueOnce(okReply(JSON.stringify({
      mutation: { layout: { pages: { '/': { hidden: ['banner'] } } } },
      explanation: 'Hid the banner',
    })))
  const result = await runPipeline('hide the banner', [], contextWith({ fetchFn }))
  expect(result.type).toBe('success')
  const stored = await storageBackend.loadTheme(userId, appId)
  expect(stored?.version).toBe(2)
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd packages/core && npx vitest run src/agent/builder.test.ts src/agent/pipeline.test.ts`
Expected: FAIL — `callBuilder` returns the old shape; SLOT_F1 still routes to the Builder.

- [ ] **Step 4: Rewrite `builder.ts`**

Full replacement (keep `extractJson` verbatim from the old file):

```ts
import type { ThemeJsonV2, InvarianceConfig, ContentSection, LayoutSection, ComponentsSection } from '../config/types'
import type { SlotRegistration } from '../context/registry'
import type { TestResult } from '../verify/types'
import { callClaude, type UsageHandler } from './api'
import { BUILDER_MODEL } from './models'

// F2/F3/F4 only: the Builder never touches theme.* — the THEME route owns
// roles, SLOT_F1 owns slot literals. Mutations are the page-keyed sections.
export interface SectionsMutation {
  content?: ContentSection
  layout?: LayoutSection
  components?: ComponentsSection
}

export type BuilderOutcome =
  | { ok: true; mutation: SectionsMutation; explanation: string }
  | { ok: false; error: string }

export interface BuilderConfigInput {
  currentTheme: ThemeJsonV2 | null
  intent: {
    slotName: string
    level: number
    description: string
    requirements: string[]
  }
  slotRegistry: SlotRegistration[]
  invariantConfig: InvarianceConfig
  retryFeedback?: TestResult[]
  fetchFn?: typeof fetch
  baseUrl?: string
  onUsage?: UsageHandler
}

function extractJson(text: string): unknown | undefined {
  // (verbatim from the previous builder.ts)
}

export async function callBuilder(input: BuilderConfigInput, apiKey: string): Promise<BuilderOutcome> {
  const systemPrompt = `You are the Builder agent for Invariance. You produce theme.json mutations (partial JSON) for content (F2), layout (F3), and component-swap (F4) changes.

CURRENT THEME.JSON:
${input.currentTheme ? JSON.stringify(input.currentTheme, null, 2) : '(empty — no customizations yet)'}

SLOT REGISTRY:
${JSON.stringify(input.slotRegistry.map((r) => ({ name: r.name, level: r.level, preserve: r.preserve })), null, 2)}

INVARIANT CONFIG:
${JSON.stringify(input.invariantConfig, null, 2)}

RULES:
1. Output ONLY valid JSON — an object with "mutation" and "explanation". No markdown fences, no commentary.
2. The mutation may contain ONLY the keys "content", "layout", "components". Style changes (colors, fonts, spacing) are handled by a different pipeline — never emit a "theme" key.
3. The mutation is deep-merged into the current theme.json; include only what changes.
4. Slot and section names must match registered slot names.
5. Do not add sections beyond what the intent level allows.

For content changes (F2):
{
  "mutation": { "content": { "pages": { "/dashboard": { "el_003": { "text": "New Title" } } } } },
  "explanation": "Updated title text"
}

For layout changes (F3):
{
  "mutation": { "layout": { "pages": { "/dashboard": { "hidden": ["announcements-banner"] } } } },
  "explanation": "Hidden the announcements banner"
}

For component swaps (F4):
{
  "mutation": { "components": { "pages": { "/dashboard": { "chart-area": { "component": "LineChart", "props": { "showGrid": true } } } } } },
  "explanation": "Swapped bar chart for line chart"
}`

  const retrySection = input.retryFeedback
    ? `\n\nPREVIOUS ATTEMPT FAILED VERIFICATION. Fix these issues:\n${input.retryFeedback.map((r) => `- ${r.name}: ${r.message}${r.suggestedFix ? ` (fix: ${r.suggestedFix})` : ''}`).join('\n')}`
    : ''

  const userMessage = `INTENT:
${input.intent.description}

REQUIREMENTS:
${input.intent.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}
${retrySection}

Produce the theme.json mutation now:`

  // No outputSchema: the structured-outputs dialect requires additionalProperties:
  // false on every object, and these sections are map-shaped (dynamic page and
  // element keys) — inexpressible. Prompt-and-parse stays until the render-driven
  // phase retypes mutations as typed op arrays.
  const result = await callClaude({
    apiKey,
    model: BUILDER_MODEL,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    temperature: 0.2,
    maxTokens: 4096,
    ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
    ...(input.onUsage ? { onUsage: input.onUsage } : {}),
  })
  if (!result.ok) return { ok: false, error: result.error }

  const parsed = extractJson(result.text) as { mutation?: Record<string, unknown>; explanation?: string } | undefined
  if (!parsed || typeof parsed !== 'object' || !parsed.mutation || typeof parsed.mutation !== 'object') {
    return { ok: false, error: 'Could not produce a valid change. Please try again.' }
  }

  // Defense in depth: keep only the three owned sections so a confused model
  // can never reach theme.roles/slots through this path.
  const mutation: SectionsMutation = {}
  if (parsed.mutation.content !== undefined) mutation.content = parsed.mutation.content as ContentSection
  if (parsed.mutation.layout !== undefined) mutation.layout = parsed.mutation.layout as LayoutSection
  if (parsed.mutation.components !== undefined) mutation.components = parsed.mutation.components as ComponentsSection

  return { ok: true, mutation, explanation: parsed.explanation ?? input.intent.description }
}
```

- [ ] **Step 5: Rewrite `pipeline.ts`**

Keep: `PipelineResult`, `deepMerge`, the THEME route's Designer/compile/verify retry loop. Delete: `mergeTheme`, `V1Mutation`, `translateMutationToV2`, the entire v1 Builder branch, the `applyThemeJson` import, the `isV2Theme` import. New shape:

```ts
export type PipelineStage = 'gatekeeper' | 'designer' | 'compiling' | 'slot-edit' | 'builder' | 'verifying' | 'retry' | 'applying'

export interface PipelineContext {
  registry: SlotRegistration[]
  config: InvarianceConfig
  themeStore: ThemeStore
  storageBackend: StorageBackend
  apiKey: string
  userId: string
  appId: string
  componentLibrary?: string[]
  fetchFn?: typeof fetch
  apiBaseUrl?: string
  onUsage?: UsageHandler
}

// Every route operates on v2: stored v1 (or nothing) upgrades exactly once here.
async function loadCurrentV2(context: PipelineContext): Promise<ThemeJsonV2> {
  const stored: AnyThemeJson | null =
    context.themeStore.getTheme() ??
    await context.storageBackend.loadTheme(context.userId, context.appId)
  const { theme } = upgradeThemeJson(stored ?? { version: 1, base_app_version: 'v1' })
  return theme
}

async function persistAndApply(context: PipelineContext, candidate: ThemeJsonV2): Promise<void> {
  await context.storageBackend.saveTheme(context.userId, context.appId, candidate)
  context.themeStore.setTheme(candidate)
  applyAnyTheme(candidate, context.config)
}

// Builder mutations only carry the page-keyed sections; theme.* is owned by
// the THEME and SLOT_F1 routes and passes through verbatim.
function mergeSectionsIntoV2(current: ThemeJsonV2, mutation: SectionsMutation): ThemeJsonV2 {
  const candidate: ThemeJsonV2 = {
    version: 2,
    base_app_version: current.base_app_version,
    ...(current.theme !== undefined ? { theme: current.theme } : {}),
  }
  const merged = <T>(cur: T | undefined, mut: T | undefined): T | undefined => {
    if (mut === undefined) return cur
    return deepMerge((cur ?? {}) as Record<string, unknown>, mut as Record<string, unknown>) as unknown as T
  }
  const content = merged(current.content, mutation.content)
  if (content !== undefined) candidate.content = content
  const layout = merged(current.layout, mutation.layout)
  if (layout !== undefined) candidate.layout = layout
  const components = merged(current.components, mutation.components)
  if (components !== undefined) candidate.components = components
  return candidate
}
```

`runPipeline(userMessage, conversationHistory, context: PipelineContext, onProgress?)`:

1. Build a shared `agentOpts` object once:

```ts
  const agentOpts = {
    ...(context.fetchFn ? { fetchFn: context.fetchFn } : {}),
    ...(context.apiBaseUrl ? { baseUrl: context.apiBaseUrl } : {}),
    ...(context.onUsage ? { onUsage: context.onUsage } : {}),
  }
```

2. Gatekeeper call: as today plus `...agentOpts`.
3. THEME route: as today, but replace the inline stored-theme load with `const currentV2 = await loadCurrentV2(context)`, pass `...agentOpts` to `callDesigner`, and replace the store/set/apply triplet with `await persistAndApply(context, candidate)`.
4. New SLOT_F1 route, before the Builder route:

```ts
  if (gatekeeperResult.kind === 'SLOT_F1') {
    onProgress?.('slot-edit')
    const constraints = deriveConstraints(context.config)
    const currentV2 = await loadCurrentV2(context)
    const outcome = await runSlotEdit({
      intent: { slotName: gatekeeperResult.slotName, description: gatekeeperResult.description },
      currentV2,
      registry: context.registry,
      constraints,
      config: context.config,
      apiKey: context.apiKey,
      ...agentOpts,
    })
    if (!outcome.ok) return { type: 'error', message: outcome.error }
    onProgress?.('applying')
    await persistAndApply(context, outcome.candidate)
    return { type: 'success', description: outcome.explanation, slotName: gatekeeperResult.slotName }
  }
```

5. F2/F3/F4 route (replaces both old branches):

```ts
  const intent = {
    slotName: gatekeeperResult.slotName,
    level: gatekeeperResult.level,
    description: gatekeeperResult.description,
    requirements: gatekeeperResult.requirements,
  }

  onProgress?.('builder')
  const currentV2 = await loadCurrentV2(context)
  const builderInput = {
    currentTheme: currentV2,
    intent,
    slotRegistry: context.registry,
    invariantConfig: context.config,
    ...agentOpts,
  }
  let builderResult = await callBuilder(builderInput, context.apiKey)

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    onProgress?.(attempt === 0 ? 'verifying' : 'retry')
    if (!builderResult.ok) return { type: 'error', message: builderResult.error }

    const candidate = mergeSectionsIntoV2(currentV2, builderResult.mutation)
    // The v5 engine verifies the page-keyed sections; their shapes are shared
    // between v1 and v2, so the cast is sound.
    const verification = verify(
      candidate as unknown as ThemeJson,
      context.config,
      intent.level,
      context.registry,
      componentLibrary,
    )

    if (verification.passed) {
      onProgress?.('applying')
      await persistAndApply(context, candidate)
      return { type: 'success', description: builderResult.explanation, slotName: intent.slotName }
    }

    if (attempt < maxRetries) {
      builderResult = await callBuilder(
        { ...builderInput, retryFeedback: verification.results.filter((r) => !r.passed) },
        context.apiKey,
      )
    }
  }

  return {
    type: 'error',
    message: 'Could not produce a valid change after multiple attempts. Try a simpler change.',
  }
```

- [ ] **Step 6: Wire `apiBaseUrl`/`onUsage` through provider and panel**

`provider.tsx`: add `apiBaseUrl?: string` and `onUsage?: UsageHandler` to `InvarianceProviderProps` and `InvarianceContextValue` (import the type from `'../agent/api'`), destructure them, include them in the context `value` memo (and its dependency array). In `customization-overlay.tsx`: where the overlay builds the `runPipeline` context (search for `runPipeline(`), pull both from `useInvariance()` and spread-add:

```ts
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      ...(onUsage ? { onUsage } : {}),
```

Also add the new stage to `PROGRESS_LABELS` (line ~130), matching the tone of the neighboring labels:

```ts
  'slot-edit': 'Adjusting colors…',
```

- [ ] **Step 7: Update `pipeline.test.ts`** — delete the v1-path and translate-bridge cases (the features are gone by design), adapt kept cases to `BuilderOutcome`, confirm the two new tests pass.

Run: `cd packages/core && npx vitest run`
Expected: PASS. Note the count delta in the commit message.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Route SLOT_F1 to slot-edit; Builder is F2-F4 sections-only; pipeline is v2-native"
```

---

### Task 7: Delete slot.tsx inline-style machinery

With the v1 pipeline path gone and the provider always upgrading to v2 in memory, the inline-style path in `m.slot` (childCss/!important, `theme.slots` style maps) is dead code. DESIGN.md Part 3 removes it explicitly.

**Files:**
- Modify: `packages/core/src/primitives/slot.tsx`
- Test: existing primitives tests (update/delete inline-style assertions)

- [ ] **Step 1: Find affected tests**

Run: `grep -rn "childCss\|buildChildCss\|display: 'contents'\|slots" packages/core/src/primitives/*.test.*`
Delete assertions that exercise inline styles/childCss (the feature is removed by design); keep registration and F4-swap assertions.

- [ ] **Step 2: Rewrite the component body**

Remove `toKebab`, `buildChildCss`, `slotStyles`, `childCss`, `hasInlineStyles`, the `useMemo`/`CSSProperties`/`isV2Theme` imports. The F4 branch keeps the ErrorBoundary but loses `style={slotStyles}` and the `<style>` child; both the F4 wrapper and the default wrapper become:

```tsx
    <div data-inv-slot={name} data-inv-section={name} data-inv-level={level} style={{ display: 'contents' }}>
```

(F4 branch keeps its existing attributes minus the level attr it never had.) Add the why-comment:

```tsx
  // F1 styling flows exclusively through --inv-* variables on :root; the wrapper
  // stays layout-transparent so flex/grid parent-child relationships hold.
```

- [ ] **Step 3: Run to verify**

Run: `cd packages/core && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Remove inline-style and childCss machinery from m.slot"
```

---

### Task 8: Extract `@invariance/schema` (keystone contracts package)

Per DESIGN.md Part 5. Pure mechanical move with back-compat re-export stubs in core, so **no other file in core or scanner changes its imports**. The package depends only on zod.

**Files:**
- Create: `packages/schema/package.json`, `packages/schema/tsconfig.json`, `packages/schema/src/index.ts`, `packages/schema/src/style-spec.ts`, `packages/schema/src/theme.ts`, `packages/schema/src/theme-schemas.ts`, `packages/schema/src/role-tokens.ts`, `packages/schema/src/canonical-json.ts`, `packages/schema/src/index.test.ts`
- Modify into re-export stubs: `packages/core/src/compiler/style-spec.ts`, `packages/core/src/config/types.ts`, `packages/core/src/config/schema.ts`, `packages/core/src/utils/canonical-json.ts`
- Modify: `packages/core/src/compiler/roles.ts` (import vocabulary from the new package, re-export), `packages/core/package.json` (workspace dep)

- [ ] **Step 1: Scaffold the package**

`packages/schema/package.json`:

```json
{
  "name": "@invariance/schema",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc --project tsconfig.json",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

`packages/schema/tsconfig.json`: copy core's tsconfig, delete the `"jsx"` line, and set `"lib": ["ES2020"]` (no DOM — contracts only).

- [ ] **Step 2: Move the contract files**

- `core/src/compiler/style-spec.ts` → `schema/src/style-spec.ts` verbatim.
- `core/src/config/types.ts` → `schema/src/theme.ts`, changing its import to `import type { StyleSpec } from './style-spec'`.
- `core/src/config/schema.ts` → `schema/src/theme-schemas.ts`, changing its imports to `from './style-spec'` (and `./theme` if it imports types).
- `core/src/utils/canonical-json.ts` → `schema/src/canonical-json.ts` verbatim.
- From `core/src/compiler/roles.ts`, cut ONLY `ROLE_TOKENS`, `RoleToken`, and `COLOR_ROLE_TOKENS` into `schema/src/role-tokens.ts`; the rest of roles.ts (assignment logic) stays in core.

`schema/src/index.ts`:

```ts
export * from './style-spec'
export * from './theme'
export * from './theme-schemas'
export * from './role-tokens'
export * from './canonical-json'
```

`schema/src/index.test.ts` (smoke — full coverage stays with the consuming tests in core):

```ts
import { describe, it, expect } from 'vitest'
import { StyleSpecSchema, ThemeJsonV2Schema, ROLE_TOKENS, canonicalStringify, isV2Theme } from './index'

describe('@invariance/schema surface', () => {
  it('exports the contract surface', () => {
    expect(ROLE_TOKENS.length).toBeGreaterThan(20)
    expect(StyleSpecSchema.safeParse({}).success).toBe(false)
    expect(ThemeJsonV2Schema.safeParse({ version: 2, base_app_version: 'v1' }).success).toBe(true)
    expect(isV2Theme({ version: 2, base_app_version: 'v1' })).toBe(true)
    expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })
})
```

(If `ThemeJsonV2Schema` requires more fields, read `theme-schemas.ts` and use its minimal valid document.)

- [ ] **Step 3: Stub the old paths in core**

Add `"@invariance/schema": "workspace:*"` to core's `dependencies`, then `pnpm install` at the root. Replace each moved file's content with a re-export of **every name the old file exported** (run `grep -n "^export" <file>` on the pre-move version to enumerate; `export *` is fine when names don't collide):

- `core/src/compiler/style-spec.ts` → `export * from '@invariance/schema'` is WRONG here (it would re-export theme types from a compiler path); instead re-export exactly the old names:

```ts
export { StyleSpecSchema, ACCENT_CHROMA, NEUTRAL_TINT_CHROMA, CONTRAST_TARGETS } from '@invariance/schema'
export type { StyleSpec, DesignConstraints } from '@invariance/schema'
```

- `core/src/config/types.ts`:

```ts
export { isV2Theme } from '@invariance/schema'
export type {
  InvarianceConfig, ThemeCssVars, ThemeGlobals, ThemeSection, ContentEntry,
  ContentSection, LayoutPage, LayoutSection, ComponentSelection,
  ComponentsSection, ThemeJson, ThemeSectionV2, ThemeJsonV2, AnyThemeJson,
} from '@invariance/schema'
```

- `core/src/config/schema.ts`: re-export its old names (`InvarianceConfigSchema`, `ThemeJsonSchema`, `ThemeJsonV2Schema`, plus any others the grep finds).
- `core/src/utils/canonical-json.ts`: `export { canonicalStringify } from '@invariance/schema'`.
- `core/src/compiler/roles.ts`: add `import` of the vocabulary from `'@invariance/schema'` and re-export it (`export { ROLE_TOKENS, COLOR_ROLE_TOKENS } from '@invariance/schema'` / `export type { RoleToken } from '@invariance/schema'`), keeping the assignment logic unchanged.

No test files move: the stubs keep every existing core test importing from its old path.

- [ ] **Step 4: Build + full suite**

Run: `cd /Users/anuraag/invariance && pnpm install && pnpm build && pnpm test`
Expected: schema builds first (turbo `^build`), core and scanner stay green, schema's smoke test passes.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Extract @invariance/schema: contracts move, core re-exports from old paths"
```

---

### Task 9: Final verification + docs sync

**Files:**
- Verify only (CLAUDE.md/DESIGN.md were already updated when this plan was authored — confirm they match what landed)

- [ ] **Step 1: Full clean verification**

```bash
cd /Users/anuraag/invariance && pnpm install && pnpm build && pnpm test
```

Expected: all packages green. Record the new total test count.

- [ ] **Step 2: Grep for leftovers**

```bash
grep -rn "translateMutationToV2\|buildChildCss\|mergeTheme" packages/core/src/ || echo CLEAN
```

Expected: `CLEAN` (no dead references).

- [ ] **Step 3: Confirm docs match reality** — CLAUDE.md phase 4 line and directory tree (schema package, slot-edit.ts) should describe what now exists; fix discrepancies if any task drifted.

- [ ] **Step 4: Final commit (if docs changed) and report**

```bash
git add -A && git commit -m "Phase 4 docs sync" || true
git log --oneline designer-pipeline..HEAD
```

Report: total tests, list of deleted features (v1 pipeline path, translate bridge, inline-style slots), and that the branch is ready for review/merge via superpowers:finishing-a-development-branch.

---

## Self-Review Notes (author-checked)

- **Spec coverage:** DESIGN.md 1.9 (slot-edit skips Designer; constrained pick; dependent-token contrast solve) → Tasks 4-6. Part 3 (theme.slots/childCss removal, Builder F2-F4) → Tasks 6-7. Part 5 addenda (usage hook, base URL, canonical bytes, verify-on-load, schema package) → Tasks 1-3, 8. CLAUDE.md phase 4 exit criteria → Task 9.
- **Known judgment calls:** Builder keeps prompt-and-parse (wire dialect cannot express map-shaped sections — documented in code); slot-edit handles color vars only (non-color slot edits return the polite error via zod/wire-enum mismatch — radius/spacing edits are role-level and belong to THEME); `lockedTokensUntouched` skips only the empty-roles case, preserving compiled-theme protection.
- **Type consistency spot-checks:** `UsageHandler` defined once in api.ts, imported everywhere else; `SectionsMutation` defined in builder.ts, imported by pipeline.ts; `runSlotEdit` consumes `DesignConstraints` from the same module path the pipeline's `deriveConstraints` returns; `SLOT_EDIT_MODEL` (not `GATEKEEPER_MODEL`) in slot-edit.
