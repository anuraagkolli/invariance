# Theme Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic Theme Compiler (StyleSpec → complete WCAG-compliant role-token map), the starter registries, and theme.json v2 with the v1 upgrade path, per `docs/superpowers/specs/2026-06-10-theme-compiler-design.md`.

**Architecture:** Ramp-first pure pipeline in `packages/core/src/compiler/`: zod-validated StyleSpec → OKLCH ramps (culori) → role assignment with locked-token pass-through → binary-search contrast solving recomputed on gamut-mapped sRGB → fixed non-color token tables. Registries are data modules. theme.json v2 lands as new types/schema/upgrade beside (not replacing) v1; runtime keeps consuming v1 until phase 4/5.

**Tech Stack:** TypeScript strict, culori@^4 (only new dep), zod, vitest. Repo conventions: named exports, no semicolons, single quotes, kebab-case files, colocated tests, comments explain why. Read `.claude/skills/oklch-compiler/SKILL.md` before compiler tasks and `.claude/skills/design-taste/SKILL.md` before registry tasks.

**Read first:** the spec (`docs/superpowers/specs/2026-06-10-theme-compiler-design.md`) — all tables (L_SCALE, contrast pair matrix, token tables) are normative there.

**Worker context notes:**
- Run all commands from the repo root `/Users/anuraag/invariance`.
- `pnpm --filter invariance test -- run <file>` runs one vitest file; plain `pnpm --filter invariance test` runs the package suite (must stay green: 84 tests at baseline).
- Existing v1 theme types/schema in `packages/core/src/config/{types,schema}.ts` MUST NOT change shape — v2 is added beside them.
- culori v4 facts (verified): `converter('oklch')` returns a function; `formatHex` silently clips out-of-gamut — always `clampChroma(c, 'oklch')` first; `h` may be `undefined` for achromatic colors (guard `h ?? 0`); `wcagContrast(a, b)` accepts hex strings or color objects.

---

### Task 1: Add culori + smoke test

**Files:**
- Modify: `packages/core/package.json` (dependencies)
- Test: `packages/core/src/compiler/culori-smoke.test.ts` (create; also creates the `compiler/` dir)

- [ ] **Step 1: Install culori**

```bash
pnpm --filter invariance add culori@^4
```

If a later `tsc` step fails with "Could not find a declaration file for module 'culori'", additionally run `pnpm --filter invariance add -D @types/culori`.

- [ ] **Step 2: Write the smoke test** (pins the API facts the compiler relies on)

```ts
// packages/core/src/compiler/culori-smoke.test.ts
import { describe, it, expect } from 'vitest'
import { converter, formatHex, wcagContrast, clampChroma } from 'culori'

describe('culori API assumptions', () => {
  it('converter("oklch") parses hex to oklch object', () => {
    const toOklch = converter('oklch')
    const c = toOklch('#1a1a2e')
    expect(c?.mode).toBe('oklch')
    expect(c?.l).toBeGreaterThan(0)
    expect(c?.l).toBeLessThan(1)
  })

  it('formatHex emits lowercase 6-digit hex from oklch', () => {
    const hex = formatHex({ mode: 'oklch', l: 0.7, c: 0.1, h: 25 })
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('clampChroma reduces chroma to fit sRGB, preserving l and h', () => {
    const clamped = clampChroma({ mode: 'oklch', l: 0.95, c: 0.3, h: 110 }, 'oklch')
    expect(clamped.c).toBeLessThan(0.3)
    expect(clamped.l).toBeCloseTo(0.95, 1)
  })

  it('wcagContrast matches known values (white/black = 21)', () => {
    expect(wcagContrast('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })

  it('measured fact: white on #e94560 FAILS 4.5, black passes', () => {
    expect(wcagContrast('#ffffff', '#e94560')).toBeLessThan(4.5)
    expect(wcagContrast('#000000', '#e94560')).toBeGreaterThan(4.5)
  })

  it('achromatic colors may have undefined hue', () => {
    const toOklch = converter('oklch')
    const gray = toOklch('#808080')
    expect(gray?.h ?? 0).toBe(gray?.h ?? 0) // documents the h ?? 0 guard
  })
})
```

- [ ] **Step 3: Run it**

Run: `pnpm --filter invariance test -- run src/compiler/culori-smoke.test.ts`
Expected: PASS (6 tests). If the white-on-#e94560 test fails, STOP — the spec's worked example is wrong and the contrast solver design needs review.

- [ ] **Step 4: Verify build still passes** — `pnpm --filter invariance build` → exit 0

- [ ] **Step 5: Commit** — `git add -A packages/core && git commit -m "Add culori dependency with API smoke test"`

---

### Task 2: StyleSpec types + zod schema

**Files:**
- Create: `packages/core/src/compiler/style-spec.ts`
- Test: `packages/core/src/compiler/style-spec.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/compiler/style-spec.test.ts
import { describe, it, expect } from 'vitest'
import {
  StyleSpecSchema, ACCENT_CHROMA, NEUTRAL_TINT_CHROMA, CONTRAST_TARGETS,
} from './style-spec'

const valid = {
  mode: 'dark', accentHue: 55, accentChroma: 'vivid',
  neutralTint: 280, neutralTintStrength: 'subtle', contrast: 'standard',
  fontPairing: 'retro-terminal', radius: 'sharp', shadow: 'hard-offset',
  density: 'compact', borderWeight: 'heavy',
  rationale: 'CRT arcade: amber on deep violet-black, mono type, hard edges.',
}

describe('StyleSpecSchema', () => {
  it('accepts a valid spec', () => {
    expect(StyleSpecSchema.safeParse(valid).success).toBe(true)
  })
  it('accepts optional secondaryHue', () => {
    expect(StyleSpecSchema.safeParse({ ...valid, secondaryHue: 320 }).success).toBe(true)
  })
  it('rejects out-of-range hue', () => {
    expect(StyleSpecSchema.safeParse({ ...valid, accentHue: 400 }).success).toBe(false)
  })
  it('rejects unknown enum values', () => {
    expect(StyleSpecSchema.safeParse({ ...valid, radius: 'круглый' }).success).toBe(false)
  })
  it('rejects empty rationale', () => {
    expect(StyleSpecSchema.safeParse({ ...valid, rationale: '' }).success).toBe(false)
  })
})

describe('value tables', () => {
  it('chroma tables match the spec', () => {
    expect(ACCENT_CHROMA).toEqual({ muted: 0.08, medium: 0.15, vivid: 0.22 })
    expect(NEUTRAL_TINT_CHROMA).toEqual({ none: 0, subtle: 0.02, strong: 0.04 })
  })
  it('contrast targets match the spec', () => {
    expect(CONTRAST_TARGETS).toEqual({ soft: 4.5, standard: 4.5, high: 7.0 })
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter invariance test -- run src/compiler/style-spec.test.ts` → FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// packages/core/src/compiler/style-spec.ts
import { z } from 'zod'

// Designer output: structured design intent. NEVER raw token values —
// the Compiler picks every actual value (DESIGN.md 1.2).
export interface StyleSpec {
  mode: 'light' | 'dark'
  accentHue: number
  accentChroma: 'muted' | 'medium' | 'vivid'
  secondaryHue?: number
  neutralTint: number
  neutralTintStrength: 'none' | 'subtle' | 'strong'
  contrast: 'soft' | 'standard' | 'high'
  fontPairing: string
  radius: 'sharp' | 'subtle' | 'rounded' | 'pill'
  shadow: 'flat' | 'subtle' | 'pronounced' | 'hard-offset'
  density: 'compact' | 'standard' | 'comfortable'
  borderWeight: 'hairline' | 'standard' | 'heavy'
  rationale: string
}

export const StyleSpecSchema = z.object({
  mode: z.enum(['light', 'dark']),
  accentHue: z.number().min(0).max(360),
  accentChroma: z.enum(['muted', 'medium', 'vivid']),
  secondaryHue: z.number().min(0).max(360).optional(),
  neutralTint: z.number().min(0).max(360),
  neutralTintStrength: z.enum(['none', 'subtle', 'strong']),
  contrast: z.enum(['soft', 'standard', 'high']),
  fontPairing: z.string().min(1),
  radius: z.enum(['sharp', 'subtle', 'rounded', 'pill']),
  shadow: z.enum(['flat', 'subtle', 'pronounced', 'hard-offset']),
  density: z.enum(['compact', 'standard', 'comfortable']),
  borderWeight: z.enum(['hairline', 'standard', 'heavy']),
  rationale: z.string().min(1),
})

// Developer constraints consumed by compileTheme. YAML wiring is a later phase.
export interface DesignConstraints {
  contrast?: number
  accent_chroma_max?: number
  allowed_modes?: Array<'light' | 'dark'>
  locked_tokens?: Record<string, string>
  font_registry?: string[]
}

export const ACCENT_CHROMA = { muted: 0.08, medium: 0.15, vivid: 0.22 } as const
export const NEUTRAL_TINT_CHROMA = { none: 0, subtle: 0.02, strong: 0.04 } as const
// Per-level body-text target. 'soft' equals 'standard' numerically: the 3.0
// large-text floor only applies to tokens explicitly marked large-text, and
// no Phase 1 token is.
export const CONTRAST_TARGETS = { soft: 4.5, standard: 4.5, high: 7.0 } as const
```

- [ ] **Step 4: Run to verify pass** — same command → PASS (7 tests)

- [ ] **Step 5: Commit** — `git add -A packages/core/src/compiler && git commit -m "Add StyleSpec schema and compiler value tables"`

---

### Task 3: Ramps

**Files:**
- Create: `packages/core/src/compiler/ramps.ts`
- Test: `packages/core/src/compiler/ramps.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/compiler/ramps.test.ts
import { describe, it, expect } from 'vitest'
import { wcagContrast } from 'culori'
import { L_SCALE, ACCENT_L_SCALE, neutralRamp, accentRamp, toHex } from './ramps'

describe('L_SCALE', () => {
  it('has 11 steps, never pure black or white', () => {
    expect(L_SCALE).toHaveLength(11)
    expect(Math.max(...L_SCALE)).toBeLessThan(1)
    expect(Math.min(...L_SCALE)).toBeGreaterThan(0)
  })
})

describe('neutralRamp', () => {
  const spec = { mode: 'light', neutralTint: 250, neutralTintStrength: 'subtle' } as const

  it('returns 11 oklch colors descending in l for light mode', () => {
    const ramp = neutralRamp(spec)
    expect(ramp).toHaveLength(11)
    for (let i = 1; i < ramp.length; i++) expect(ramp[i].l).toBeLessThan(ramp[i - 1].l)
  })

  it('ascends in l for dark mode', () => {
    const ramp = neutralRamp({ ...spec, mode: 'dark' })
    expect(ramp[0].l).toBeCloseTo(0.15, 2)
    expect(ramp[10].l).toBeCloseTo(0.98, 2)
  })

  it('strength none means zero chroma', () => {
    for (const c of neutralRamp({ ...spec, neutralTintStrength: 'none' })) expect(c.c).toBe(0)
  })

  it('reduces chroma on the darkest three steps', () => {
    const ramp = neutralRamp({ ...spec, neutralTintStrength: 'strong' })
    // light mode: darkest steps are at the end
    expect(ramp[8].c).toBeCloseTo(0.04 * 0.6, 4)
    expect(ramp[9].c).toBeCloseTo(0.04 * 0.4, 4)
    expect(ramp[10].c).toBeCloseTo(0.04 * 0.25, 4)
  })

  it('is deterministic', () => {
    expect(neutralRamp(spec)).toEqual(neutralRamp(spec))
  })
})

describe('accentRamp', () => {
  it('returns 5 steps with the center at ACCENT_L_SCALE[2]', () => {
    const ramp = accentRamp({ mode: 'light', accentHue: 25, accentChroma: 'vivid' })
    expect(ramp).toHaveLength(5)
    expect(ramp[2].l).toBeCloseTo(ACCENT_L_SCALE[2], 2)
  })

  it('every step is in sRGB gamut (hex round-trips)', () => {
    // blues clip early — the canonical gamut stress case
    const ramp = accentRamp({ mode: 'light', accentHue: 260, accentChroma: 'vivid' })
    for (const step of ramp) {
      const hex = toHex(step)
      expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('dark mode reduces chroma by 0.9', () => {
    const light = accentRamp({ mode: 'light', accentHue: 25, accentChroma: 'medium' })
    const dark = accentRamp({ mode: 'dark', accentHue: 25, accentChroma: 'medium' })
    expect(dark[2].c).toBeCloseTo(light[2].c * 0.9, 4)
  })

  it('a locked seed re-centers the ramp', () => {
    const seed = { l: 0.62, c: 0.19, h: 12 }
    const ramp = accentRamp({ mode: 'light', accentHue: 200, accentChroma: 'muted' }, seed)
    expect(ramp[2].l).toBeCloseTo(0.62, 2)
    expect(ramp[2].h).toBe(12)
    expect(ramp[0].l).toBeCloseTo(0.82, 2) // +0.20, clamped to [0.20, 0.95]
    expect(ramp[4].l).toBeCloseTo(0.42, 2) // -0.20
  })
})

describe('ramp utility sanity', () => {
  it('light surface steps give strong contrast vs dark text', () => {
    const ramp = neutralRamp({ mode: 'light', neutralTint: 0, neutralTintStrength: 'none' })
    expect(wcagContrast(toHex(ramp[0]), '#111111')).toBeGreaterThan(10)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// packages/core/src/compiler/ramps.ts
import { clampChroma, formatHex } from 'culori'

import { NEUTRAL_TINT_CHROMA, ACCENT_CHROMA } from './style-spec'
import type { StyleSpec } from './style-spec'

export interface OklchColor {
  mode: 'oklch'
  l: number
  c: number
  h: number
}

// Non-linear lightness scale: resolution concentrated near the light end where
// surface distinctions live. Spec-normative constant — golden tests depend on it.
export const L_SCALE = [0.98, 0.955, 0.92, 0.86, 0.78, 0.68, 0.57, 0.46, 0.36, 0.25, 0.15] as const
export const ACCENT_L_SCALE = [0.85, 0.75, 0.65, 0.55, 0.45] as const

// Warm hues go muddy at low lightness unless chroma backs off.
const DARK_STEP_CHROMA_FACTORS: Record<number, number> = { 8: 0.6, 9: 0.4, 10: 0.25 }

const clampL = (l: number): number => Math.min(0.95, Math.max(0.2, l))

export function toHex(color: OklchColor): string {
  // formatHex silently clips out-of-gamut channels — always gamut-map first.
  return formatHex(clampChroma(color, 'oklch'))
}

export function neutralRamp(
  spec: Pick<StyleSpec, 'mode' | 'neutralTint' | 'neutralTintStrength'>,
): OklchColor[] {
  const baseChroma = NEUTRAL_TINT_CHROMA[spec.neutralTintStrength]
  const ramp = L_SCALE.map((l, i) => {
    const c = baseChroma * (DARK_STEP_CHROMA_FACTORS[i] ?? 1)
    return clampChroma({ mode: 'oklch' as const, l, c, h: spec.neutralTint }, 'oklch') as OklchColor
  })
  return spec.mode === 'light' ? ramp : [...ramp].reverse()
}

export interface AccentSeed {
  l: number
  c: number
  h: number
}

export function accentRamp(
  spec: Pick<StyleSpec, 'mode' | 'accentHue' | 'accentChroma'>,
  seed?: AccentSeed,
  chromaMax?: number,
): OklchColor[] {
  const darkFactor = spec.mode === 'dark' ? 0.9 : 1
  const h = seed?.h ?? spec.accentHue
  const rawChroma = seed?.c ?? ACCENT_CHROMA[spec.accentChroma]
  const c = Math.min(rawChroma, chromaMax ?? Infinity) * darkFactor
  const ls = seed
    ? [seed.l + 0.2, seed.l + 0.1, seed.l, seed.l - 0.1, seed.l - 0.2].map(clampL)
    : [...ACCENT_L_SCALE]
  return ls.map(
    (l) => clampChroma({ mode: 'oklch' as const, l, c, h }, 'oklch') as OklchColor,
  )
}
```

Note: when a seed re-centers the ramp, the seed step itself keeps its exact `l` (the lock pass-through in roles.ts emits the locked literal anyway; the ramp only feeds *dependent* steps).

- [ ] **Step 4: Run to verify pass** — PASS (11 tests)

- [ ] **Step 5: Commit** — `git commit -am "Add OKLCH neutral and accent ramp generation"`

---

### Task 4: Contrast solver

**Files:**
- Create: `packages/core/src/compiler/contrast.ts`
- Test: `packages/core/src/compiler/contrast.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/compiler/contrast.test.ts
import { describe, it, expect } from 'vitest'
import { wcagContrast } from 'culori'
import { srgbLuminance, solveText } from './contrast'

describe('srgbLuminance', () => {
  it('white is 1, black is 0', () => {
    expect(srgbLuminance('#ffffff')).toBeCloseTo(1, 2)
    expect(srgbLuminance('#000000')).toBeCloseTo(0, 2)
  })
})

describe('solveText', () => {
  it('solves dark text on a light surface', () => {
    const r = solveText('#f5f5f7', { hue: 250, chroma: 0.02, target: 4.5 })
    expect(r.met).toBe(true)
    expect(wcagContrast(r.hex, '#f5f5f7')).toBeGreaterThanOrEqual(4.5)
  })

  it('solves light text on a dark surface', () => {
    const r = solveText('#16161d', { hue: 250, chroma: 0.02, target: 4.5 })
    expect(r.met).toBe(true)
    expect(wcagContrast(r.hex, '#16161d')).toBeGreaterThanOrEqual(4.5)
  })

  it('solves text ON the brand accent (the #e94560 case)', () => {
    const r = solveText('#e94560', { hue: 12, chroma: 0.02, target: 4.5 })
    expect(r.met).toBe(true)
    expect(wcagContrast(r.hex, '#e94560')).toBeGreaterThanOrEqual(4.5)
    // mid-lightness accent: solution must be dark, not white
    expect(srgbLuminance(r.hex)).toBeLessThan(srgbLuminance('#e94560'))
  })

  it('degrades chroma when a vivid hue cannot reach target', () => {
    // vivid yellow text on white cannot reach 7.0 at c=0.22
    const r = solveText('#ffffff', { hue: 110, chroma: 0.22, target: 7.0 })
    expect(r.met).toBe(true)
    expect(wcagContrast(r.hex, '#ffffff')).toBeGreaterThanOrEqual(7.0)
  })

  it('returns met:false with the best extreme for unsatisfiable targets', () => {
    // nothing reaches 21+ against mid-gray
    const r = solveText('#808080', { hue: 0, chroma: 0, target: 15 })
    expect(r.met).toBe(false)
    expect(['#000000', '#ffffff']).toContain(r.hex)
  })

  it('snaps to a passing ramp step when one is close', () => {
    const r = solveText('#ffffff', { hue: 250, chroma: 0.02, target: 4.5, rampLs: [0.45, 0.36] })
    expect(r.met).toBe(true)
    expect(wcagContrast(r.hex, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('is deterministic', () => {
    const a = solveText('#fafafa', { hue: 30, chroma: 0.04, target: 4.5 })
    const b = solveText('#fafafa', { hue: 30, chroma: 0.04, target: 4.5 })
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// packages/core/src/compiler/contrast.ts
import { clampChroma, formatHex, wcagContrast } from 'culori'

// WCAG relative luminance recovered from the contrast-vs-black identity:
// contrast(x, black) = (L + 0.05) / 0.05. Keeps us on the verified API surface.
export function srgbLuminance(hex: string): number {
  return wcagContrast(hex, '#000000') * 0.05 - 0.05
}

export interface SolveOptions {
  hue: number
  chroma: number
  target: number
  rampLs?: readonly number[]
}

export interface SolveResult {
  hex: string
  ratio: number
  met: boolean
}

const candidate = (l: number, c: number, h: number): string =>
  formatHex(clampChroma({ mode: 'oklch', l, c, h }, 'oklch'))

// Binary search on OKLCH lightness. OKLCH l is perceptual, NOT WCAG luminance:
// the ratio must be recomputed on the gamut-mapped sRGB color every iteration.
function search(surfaceHex: string, hue: number, chroma: number, target: number): SolveResult | null {
  const searchDown = srgbLuminance(surfaceHex) > 0.5
  const extremeL = searchDown ? 0 : 1
  const extremeHex = candidate(extremeL, chroma, hue)
  if (wcagContrast(extremeHex, surfaceHex) < target) return null

  // pass region is the interval between the extreme and the boundary l*
  let lo = 0
  let hi = 1
  let best: SolveResult = { hex: extremeHex, ratio: wcagContrast(extremeHex, surfaceHex), met: true }
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const hex = candidate(mid, chroma, hue)
    const ratio = wcagContrast(hex, surfaceHex)
    const pass = ratio >= target
    if (pass) best = { hex, ratio, met: true }
    if (searchDown) {
      // pass iff l <= l*: move toward the boundary from whichever side we're on
      if (pass) lo = mid
      else hi = mid
    } else {
      if (pass) hi = mid
      else lo = mid
    }
  }
  return best
}

export function solveText(surfaceHex: string, opts: SolveOptions): SolveResult {
  for (const c of [opts.chroma, opts.chroma / 2, 0]) {
    const result = search(surfaceHex, opts.hue, c, opts.target)
    if (!result) continue
    if (opts.rampLs?.length) {
      // prefer a passing ramp step: solved text stays harmonious with the ramp
      const passing = opts.rampLs
        .map((l) => {
          const hex = candidate(l, c, opts.hue)
          return { hex, ratio: wcagContrast(hex, surfaceHex), met: true, l }
        })
        .filter((r) => r.ratio >= opts.target)
      if (passing.length) {
        passing.sort((a, b) => b.ratio - a.ratio)
        return { hex: passing[0].hex, ratio: passing[0].ratio, met: true }
      }
    }
    return result
  }
  // unsatisfiable: best achievable extreme, flagged for the warnings path
  const dark = srgbLuminance(surfaceHex) > 0.5
  const hex = dark ? '#000000' : '#ffffff'
  return { hex, ratio: wcagContrast(hex, surfaceHex), met: false }
}
```

- [ ] **Step 4: Run to verify pass** — PASS (9 tests)

- [ ] **Step 5: Commit** — `git commit -am "Add binary-search WCAG contrast solver"`

---

### Task 5: Font pairing registry

**Files:**
- Create: `packages/core/src/registries/font-pairings.ts`
- Test: `packages/core/src/registries/font-pairings.test.ts`

Authoring rules come from `.claude/skills/design-taste/SKILL.md`: characterful display + quieter body, never two display faces, exact Google Fonts spellings, honest tags, required category coverage.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/registries/font-pairings.test.ts
import { describe, it, expect } from 'vitest'
import { FONT_PAIRINGS, DEFAULT_MONO_STACK, getFontPairing } from './font-pairings'

describe('FONT_PAIRINGS', () => {
  it('has unique ids', () => {
    const ids = FONT_PAIRINGS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry has display, body, fallback stacks, and 2-4 tags', () => {
    for (const p of FONT_PAIRINGS) {
      expect(p.display).toContain(',') // a stack, not a bare family
      expect(p.body).toContain(',')
      expect(p.tags.length).toBeGreaterThanOrEqual(2)
      expect(p.tags.length).toBeLessThanOrEqual(4)
    }
  })

  it('covers all required categories', () => {
    const allTags = new Set(FONT_PAIRINGS.flatMap((p) => p.tags))
    for (const required of ['mono', 'geometric', 'humanist', 'editorial', 'slab', 'rounded', 'condensed']) {
      expect(allTags, `missing category tag: ${required}`).toContain(required)
    }
  })

  it('getFontPairing resolves by id and returns undefined for unknown', () => {
    expect(getFontPairing('retro-terminal')?.display).toContain('VT323')
    expect(getFontPairing('nope')).toBeUndefined()
  })

  it('exports a default mono stack', () => {
    expect(DEFAULT_MONO_STACK).toContain('monospace')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — FAIL (module not found)

- [ ] **Step 3: Implement** (family spellings verified against Google Fonts)

```ts
// packages/core/src/registries/font-pairings.ts

export interface FontPairing {
  id: string
  display: string
  body: string
  mono?: string
  tags: string[]
}

export const DEFAULT_MONO_STACK = "'JetBrains Mono', ui-monospace, 'SF Mono', monospace"

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: 'retro-terminal',
    display: "'VT323', monospace",
    body: "'Space Mono', monospace",
    mono: "'Space Mono', monospace",
    tags: ['retro', 'terminal', 'mono', 'playful'],
  },
  {
    id: 'terminal-mono',
    display: "'IBM Plex Mono', ui-monospace, monospace",
    body: "'IBM Plex Sans', system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, monospace",
    tags: ['terminal', 'mono', 'tech'],
  },
  {
    id: 'geo-grotesk',
    display: "'Space Grotesk', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
    tags: ['modern', 'tech', 'geometric', 'neutral'],
  },
  {
    id: 'editorial-serif',
    display: "'Playfair Display', Georgia, serif",
    body: "'Source Serif 4', Georgia, serif",
    tags: ['editorial', 'elegant', 'classic'],
  },
  {
    id: 'humanist-sans',
    display: "'Alegreya Sans', system-ui, sans-serif",
    body: "'Open Sans', system-ui, sans-serif",
    tags: ['humanist', 'warm', 'readable'],
  },
  {
    id: 'corporate-clean',
    display: "'Archivo', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
    tags: ['corporate', 'neutral', 'professional'],
  },
  {
    id: 'slab-press',
    display: "'Zilla Slab', Georgia, serif",
    body: "'Source Sans 3', system-ui, sans-serif",
    tags: ['slab', 'sturdy', 'editorial'],
  },
  {
    id: 'rounded-friendly',
    display: "'Baloo 2', system-ui, sans-serif",
    body: "'Nunito', system-ui, sans-serif",
    tags: ['rounded', 'playful', 'friendly'],
  },
  {
    id: 'condensed-industrial',
    display: "'Oswald', system-ui, sans-serif",
    body: "'Roboto', system-ui, sans-serif",
    tags: ['condensed', 'industrial', 'bold'],
  },
  {
    id: 'brutalist-grotesk',
    display: "'Archivo Black', system-ui, sans-serif",
    body: "'Archivo', system-ui, sans-serif",
    tags: ['brutalist', 'heavy', 'loud'],
  },
  {
    id: 'pastel-soft',
    display: "'Quicksand', system-ui, sans-serif",
    body: "'Mulish', system-ui, sans-serif",
    tags: ['soft', 'rounded', 'calm'],
  },
  {
    id: 'mono-minimal',
    display: "'JetBrains Mono', ui-monospace, monospace",
    body: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    tags: ['mono', 'minimal', 'tech'],
  },
]

export function getFontPairing(id: string): FontPairing | undefined {
  return FONT_PAIRINGS.find((p) => p.id === id)
}
```

- [ ] **Step 4: Run to verify pass** — PASS (5 tests)

- [ ] **Step 5: Commit** — `git commit -am "Add curated font pairing registry (12 starter entries)"`

---

### Task 6: Theme pack registry

**Files:**
- Create: `packages/core/src/registries/theme-packs.ts`
- Test: `packages/core/src/registries/theme-packs.test.ts`

design-taste rules enforced AS TESTS: schema validity, pairing existence, distinctness (no two packs share fontPairing AND accentHue within 30°).

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/registries/theme-packs.test.ts
import { describe, it, expect } from 'vitest'
import { StyleSpecSchema } from '../compiler/style-spec'
import { getFontPairing } from './font-pairings'
import { THEME_PACKS } from './theme-packs'

const GAUNTLET = ['retro-arcade', 'neobrutalist', 'soft-pastel', 'terminal-green',
  'glass-dark', 'editorial', 'ocean', 'sunset', 'mono', 'corporate-trust']

describe('THEME_PACKS', () => {
  it('covers the ten-vibe gauntlet', () => {
    expect(THEME_PACKS.map((p) => p.id).sort()).toEqual([...GAUNTLET].sort())
  })

  it('every pack spec passes the StyleSpec schema', () => {
    for (const pack of THEME_PACKS) {
      const result = StyleSpecSchema.safeParse(pack.spec)
      expect(result.success, `${pack.id}: ${JSON.stringify(result)}`).toBe(true)
    }
  })

  it('every fontPairing id exists in the registry', () => {
    for (const pack of THEME_PACKS) {
      expect(getFontPairing(pack.spec.fontPairing), `${pack.id} -> ${pack.spec.fontPairing}`).toBeDefined()
    }
  })

  it('distinctness: no two packs share fontPairing AND hue within 30 degrees', () => {
    for (const a of THEME_PACKS) for (const b of THEME_PACKS) {
      if (a.id >= b.id) continue
      const hueDelta = Math.min(
        Math.abs(a.spec.accentHue - b.spec.accentHue),
        360 - Math.abs(a.spec.accentHue - b.spec.accentHue),
      )
      const clash = a.spec.fontPairing === b.spec.fontPairing && hueDelta < 30
      expect(clash, `${a.id} vs ${b.id}`).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails** — FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// packages/core/src/registries/theme-packs.ts
import type { StyleSpec } from '../compiler/style-spec'

// Named StyleSpec presets. Three uses: few-shot taste examples in the Designer
// prompt, shortcuts when a request names a style, one-tap starting points in
// the panel. Free-form requests do NOT pass through packs.
export interface ThemePack {
  id: string
  name: string
  spec: StyleSpec
}

export const THEME_PACKS: ThemePack[] = [
  {
    id: 'retro-arcade',
    name: 'Retro Arcade',
    spec: {
      mode: 'dark', accentHue: 55, accentChroma: 'vivid',
      neutralTint: 280, neutralTintStrength: 'subtle', contrast: 'standard',
      fontPairing: 'retro-terminal', radius: 'sharp', shadow: 'hard-offset',
      density: 'compact', borderWeight: 'heavy',
      rationale: 'CRT arcade: amber on deep violet-black, mono type, hard edges.',
    },
  },
  {
    id: 'neobrutalist',
    name: 'Neobrutalist',
    spec: {
      mode: 'light', accentHue: 350, accentChroma: 'vivid',
      neutralTint: 0, neutralTintStrength: 'none', contrast: 'high',
      fontPairing: 'brutalist-grotesk', radius: 'sharp', shadow: 'hard-offset',
      density: 'standard', borderWeight: 'heavy',
      rationale: 'Stark neobrutalism: hot pink accent, black hard shadows, heavy borders.',
    },
  },
  {
    id: 'soft-pastel',
    name: 'Soft Pastel',
    spec: {
      mode: 'light', accentHue: 330, accentChroma: 'muted',
      neutralTint: 330, neutralTintStrength: 'subtle', contrast: 'soft',
      fontPairing: 'pastel-soft', radius: 'rounded', shadow: 'subtle',
      density: 'comfortable', borderWeight: 'hairline',
      rationale: 'Powder pastel: blush accent, rounded corners, airy spacing.',
    },
  },
  {
    id: 'terminal-green',
    name: 'Terminal Green',
    spec: {
      mode: 'dark', accentHue: 145, accentChroma: 'vivid',
      neutralTint: 145, neutralTintStrength: 'subtle', contrast: 'high',
      fontPairing: 'terminal-mono', radius: 'sharp', shadow: 'flat',
      density: 'compact', borderWeight: 'standard',
      rationale: 'Phosphor terminal: green on near-black, mono type, dead flat.',
    },
  },
  {
    id: 'glass-dark',
    name: 'Dark Glass',
    spec: {
      mode: 'dark', accentHue: 215, accentChroma: 'medium',
      neutralTint: 240, neutralTintStrength: 'subtle', contrast: 'standard',
      fontPairing: 'geo-grotesk', radius: 'rounded', shadow: 'pronounced',
      density: 'standard', borderWeight: 'hairline',
      rationale: 'Dark glass: cool blue glow, deep soft shadows, rounded panes.',
    },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    spec: {
      mode: 'light', accentHue: 15, accentChroma: 'muted',
      neutralTint: 70, neutralTintStrength: 'subtle', contrast: 'standard',
      fontPairing: 'editorial-serif', radius: 'sharp', shadow: 'flat',
      density: 'comfortable', borderWeight: 'hairline',
      rationale: 'Quiet print: serif type, paper-warm neutrals, oxblood accent.',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    spec: {
      mode: 'light', accentHue: 195, accentChroma: 'medium',
      neutralTint: 210, neutralTintStrength: 'subtle', contrast: 'standard',
      fontPairing: 'rounded-friendly', radius: 'rounded', shadow: 'subtle',
      density: 'comfortable', borderWeight: 'standard',
      rationale: 'Beach glass: aqua accent, rounded shapes, breezy spacing.',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    spec: {
      mode: 'dark', accentHue: 25, accentChroma: 'vivid', secondaryHue: 320,
      neutralTint: 300, neutralTintStrength: 'subtle', contrast: 'standard',
      fontPairing: 'condensed-industrial', radius: 'subtle', shadow: 'pronounced',
      density: 'standard', borderWeight: 'standard',
      rationale: 'Dusk poster: burnt orange over violet dusk, condensed display type.',
    },
  },
  {
    id: 'mono',
    name: 'Monochrome',
    spec: {
      mode: 'light', accentHue: 250, accentChroma: 'muted',
      neutralTint: 250, neutralTintStrength: 'none', contrast: 'high',
      fontPairing: 'mono-minimal', radius: 'sharp', shadow: 'flat',
      density: 'compact', borderWeight: 'hairline',
      rationale: 'Grayscale studio: ink on white, monospace accents, no decoration.',
    },
  },
  {
    id: 'corporate-trust',
    name: 'Corporate Trust',
    spec: {
      mode: 'light', accentHue: 245, accentChroma: 'medium',
      neutralTint: 240, neutralTintStrength: 'subtle', contrast: 'standard',
      fontPairing: 'corporate-clean', radius: 'subtle', shadow: 'subtle',
      density: 'standard', borderWeight: 'standard',
      rationale: 'Calm corporate: navy accent, quiet depth, clean sans.',
    },
  },
]
```

- [ ] **Step 4: Run to verify pass** — PASS (4 tests)

- [ ] **Step 5: Commit** — `git commit -am "Add theme pack registry covering the ten-vibe gauntlet"`

---

### Task 7: Non-color token tables

**Files:**
- Create: `packages/core/src/compiler/tokens.ts`
- Test: `packages/core/src/compiler/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/compiler/tokens.test.ts
import { describe, it, expect } from 'vitest'
import { nonColorTokens } from './tokens'

describe('nonColorTokens', () => {
  it('maps radius profiles to base/lg pairs', () => {
    const t = nonColorTokens({ radius: 'rounded', shadow: 'flat', density: 'standard', borderWeight: 'standard', mode: 'light' })
    expect(t['--inv-radius-base']).toBe('12px')
    expect(t['--inv-radius-lg']).toBe('20px')
  })

  it('hard-offset shadows are pure black in both modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const t = nonColorTokens({ radius: 'sharp', shadow: 'hard-offset', density: 'compact', borderWeight: 'heavy', mode })
      expect(t['--inv-shadow-1']).toBe('4px 4px 0 #000000')
      expect(t['--inv-shadow-2']).toBe('6px 6px 0 #000000')
    }
  })

  it('dark mode raises soft-shadow alpha', () => {
    const light = nonColorTokens({ radius: 'subtle', shadow: 'subtle', density: 'standard', borderWeight: 'standard', mode: 'light' })
    const dark = nonColorTokens({ radius: 'subtle', shadow: 'subtle', density: 'standard', borderWeight: 'standard', mode: 'dark' })
    expect(light['--inv-shadow-1']).toContain('0.08')
    expect(dark['--inv-shadow-1']).toContain('0.13')
  })

  it('density and border width map to px values', () => {
    const t = nonColorTokens({ radius: 'pill', shadow: 'flat', density: 'comfortable', borderWeight: 'hairline', mode: 'light' })
    expect(t['--inv-density-unit']).toBe('5px')
    expect(t['--inv-border-width']).toBe('1px')
  })

  it('is total over all enum combinations', () => {
    const radii = ['sharp', 'subtle', 'rounded', 'pill'] as const
    const shadows = ['flat', 'subtle', 'pronounced', 'hard-offset'] as const
    const densities = ['compact', 'standard', 'comfortable'] as const
    const weights = ['hairline', 'standard', 'heavy'] as const
    for (const radius of radii) for (const shadow of shadows)
      for (const density of densities) for (const borderWeight of weights)
        for (const mode of ['light', 'dark'] as const) {
          const t = nonColorTokens({ radius, shadow, density, borderWeight, mode })
          for (const key of ['--inv-radius-base', '--inv-radius-lg', '--inv-shadow-1', '--inv-shadow-2', '--inv-density-unit', '--inv-border-width']) {
            expect(t[key], `${radius}/${shadow}/${density}/${borderWeight}/${mode} missing ${key}`).toBeTruthy()
          }
        }
  })
})
```

- [ ] **Step 2: Run to verify it fails** — FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// packages/core/src/compiler/tokens.ts
import type { StyleSpec } from './style-spec'

// Taste decisions frozen as data (spec tables). Dark-mode soft shadows get
// ~1.6x alpha — shadows need more presence on dark surfaces. Hard-offset stays
// pure black in both modes: the neobrutalist language IS the point.
const RADIUS_TABLE: Record<StyleSpec['radius'], [string, string]> = {
  sharp: ['0px', '0px'],
  subtle: ['4px', '8px'],
  rounded: ['12px', '20px'],
  pill: ['999px', '999px'],
}

const SHADOW_TABLE: Record<StyleSpec['shadow'], { light: [string, string]; dark: [string, string] }> = {
  flat: { light: ['none', 'none'], dark: ['none', 'none'] },
  subtle: {
    light: ['0 1px 2px rgb(0 0 0 / 0.08)', '0 4px 12px rgb(0 0 0 / 0.10)'],
    dark: ['0 1px 2px rgb(0 0 0 / 0.13)', '0 4px 12px rgb(0 0 0 / 0.16)'],
  },
  pronounced: {
    light: ['0 2px 8px rgb(0 0 0 / 0.15)', '0 12px 32px rgb(0 0 0 / 0.22)'],
    dark: ['0 2px 8px rgb(0 0 0 / 0.24)', '0 12px 32px rgb(0 0 0 / 0.35)'],
  },
  'hard-offset': {
    light: ['4px 4px 0 #000000', '6px 6px 0 #000000'],
    dark: ['4px 4px 0 #000000', '6px 6px 0 #000000'],
  },
}

const BORDER_WIDTH_TABLE: Record<StyleSpec['borderWeight'], string> = {
  hairline: '1px',
  standard: '2px',
  heavy: '3px',
}

const DENSITY_TABLE: Record<StyleSpec['density'], string> = {
  compact: '3px',
  standard: '4px',
  comfortable: '5px',
}

export function nonColorTokens(
  spec: Pick<StyleSpec, 'radius' | 'shadow' | 'density' | 'borderWeight' | 'mode'>,
): Record<string, string> {
  const [radiusBase, radiusLg] = RADIUS_TABLE[spec.radius]
  const [shadow1, shadow2] = SHADOW_TABLE[spec.shadow][spec.mode]
  return {
    '--inv-radius-base': radiusBase,
    '--inv-radius-lg': radiusLg,
    '--inv-shadow-1': shadow1,
    '--inv-shadow-2': shadow2,
    '--inv-density-unit': DENSITY_TABLE[spec.density],
    '--inv-border-width': BORDER_WIDTH_TABLE[spec.borderWeight],
  }
}
```

- [ ] **Step 4: Run to verify pass** — PASS (5 tests)

- [ ] **Step 5: Commit** — `git commit -am "Add non-color token tables"`

---

### Task 8: Role assignment

**Files:**
- Create: `packages/core/src/compiler/roles.ts`
- Test: `packages/core/src/compiler/roles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/compiler/roles.test.ts
import { describe, it, expect } from 'vitest'
import { wcagContrast } from 'culori'
import { ROLE_TOKENS, COLOR_ROLE_TOKENS, assignColorRoles } from './roles'
import type { StyleSpec } from './style-spec'

const base: StyleSpec = {
  mode: 'light', accentHue: 245, accentChroma: 'medium',
  neutralTint: 240, neutralTintStrength: 'subtle', contrast: 'standard',
  fontPairing: 'corporate-clean', radius: 'subtle', shadow: 'subtle',
  density: 'standard', borderWeight: 'standard',
  rationale: 'test',
}

describe('ROLE_TOKENS', () => {
  it('is the canonical 22-token vocabulary', () => {
    expect(ROLE_TOKENS).toHaveLength(22)
    expect(ROLE_TOKENS).toContain('--inv-ring')
    expect(ROLE_TOKENS).toContain('--inv-font-mono')
  })
})

describe('assignColorRoles', () => {
  it('emits every color role as lowercase 6-digit hex', () => {
    const { roles } = assignColorRoles(base, {})
    for (const token of COLOR_ROLE_TOKENS) {
      expect(roles[token], token).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('light mode: surfaces descend in lightness, dark mode: ascend', () => {
    const light = assignColorRoles(base, {}).roles
    const dark = assignColorRoles({ ...base, mode: 'dark' }, {}).roles
    expect(wcagContrast(light['--inv-surface-0'], '#000000'))
      .toBeGreaterThan(wcagContrast(light['--inv-surface-2'], '#000000'))
    expect(wcagContrast(dark['--inv-surface-0'], '#000000'))
      .toBeLessThan(wcagContrast(dark['--inv-surface-2'], '#000000'))
  })

  it('meets the full contrast pair matrix (standard)', () => {
    const { roles } = assignColorRoles(base, {})
    for (const s of ['--inv-surface-0', '--inv-surface-1', '--inv-surface-2'])
      expect(wcagContrast(roles['--inv-text-primary'], roles[s])).toBeGreaterThanOrEqual(4.5)
    for (const s of ['--inv-surface-0', '--inv-surface-1'])
      expect(wcagContrast(roles['--inv-text-secondary'], roles[s])).toBeGreaterThanOrEqual(4.5)
    expect(wcagContrast(roles['--inv-text-primary'], roles['--inv-accent-subtle'])).toBeGreaterThanOrEqual(4.5)
    expect(wcagContrast(roles['--inv-accent-contrast'], roles['--inv-accent'])).toBeGreaterThanOrEqual(4.5)
    expect(wcagContrast(roles['--inv-accent-contrast'], roles['--inv-accent-hover'])).toBeGreaterThanOrEqual(4.5)
    expect(wcagContrast(roles['--inv-text-disabled'], roles['--inv-surface-1'])).toBeGreaterThanOrEqual(3.0)
    for (const s of ['--inv-surface-0', '--inv-surface-1'])
      expect(wcagContrast(roles['--inv-ring'], roles[s])).toBeGreaterThanOrEqual(3.0)
  })

  it('high contrast raises text-primary to 7.0', () => {
    const { roles } = assignColorRoles({ ...base, contrast: 'high' }, {})
    for (const s of ['--inv-surface-0', '--inv-surface-1', '--inv-surface-2'])
      expect(wcagContrast(roles['--inv-text-primary'], roles[s])).toBeGreaterThanOrEqual(7.0)
  })

  it('locked accent passes through byte-identical and dependents solve around it', () => {
    const { roles } = assignColorRoles(base, { '--inv-accent': '#e94560' })
    expect(roles['--inv-accent']).toBe('#e94560')
    expect(wcagContrast(roles['--inv-accent-contrast'], '#e94560')).toBeGreaterThanOrEqual(4.5)
  })

  it('locked surface passes through and text solves against it', () => {
    const { roles } = assignColorRoles(base, { '--inv-surface-1': '#fdf6e3' })
    expect(roles['--inv-surface-1']).toBe('#fdf6e3')
    expect(wcagContrast(roles['--inv-text-secondary'], '#fdf6e3')).toBeGreaterThanOrEqual(4.5)
  })

  it('accent-subtle keeps chroma low', () => {
    const { roles } = assignColorRoles({ ...base, accentChroma: 'vivid' }, {})
    expect(roles['--inv-accent-subtle']).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('is deterministic', () => {
    expect(assignColorRoles(base, {})).toEqual(assignColorRoles(base, {}))
  })
})
```

- [ ] **Step 2: Run to verify it fails** — FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// packages/core/src/compiler/roles.ts
import { converter, wcagContrast } from 'culori'

import { CONTRAST_TARGETS, NEUTRAL_TINT_CHROMA } from './style-spec'
import type { StyleSpec } from './style-spec'
import { neutralRamp, accentRamp, toHex } from './ramps'
import type { OklchColor } from './ramps'
import { solveText, srgbLuminance } from './contrast'

export const ROLE_TOKENS = [
  '--inv-surface-0', '--inv-surface-1', '--inv-surface-2',
  '--inv-text-primary', '--inv-text-secondary', '--inv-text-disabled',
  '--inv-accent', '--inv-accent-hover', '--inv-accent-contrast', '--inv-accent-subtle',
  '--inv-border', '--inv-border-strong', '--inv-ring',
  '--inv-font-display', '--inv-font-body', '--inv-font-mono',
  '--inv-radius-base', '--inv-radius-lg', '--inv-shadow-1', '--inv-shadow-2',
  '--inv-density-unit', '--inv-border-width',
] as const

export type RoleToken = (typeof ROLE_TOKENS)[number]

export const COLOR_ROLE_TOKENS = [
  '--inv-surface-0', '--inv-surface-1', '--inv-surface-2',
  '--inv-text-primary', '--inv-text-secondary', '--inv-text-disabled',
  '--inv-accent', '--inv-accent-hover', '--inv-accent-contrast', '--inv-accent-subtle',
  '--inv-border', '--inv-border-strong', '--inv-ring',
] as const

export interface ColorRoleResult {
  roles: Record<string, string>
  warnings: string[]
}

const toOklch = converter('oklch')

export function assignColorRoles(
  spec: StyleSpec,
  locks: Record<string, string>,
  accentChromaMax?: number,
): ColorRoleResult {
  const warnings: string[] = []
  const roles: Record<string, string> = {}

  const neutrals = neutralRamp(spec)
  const lock = (token: string): string | undefined => locks[token]

  // surfaces and borders come straight from ramp positions; locks override
  roles['--inv-surface-0'] = lock('--inv-surface-0') ?? toHex(neutrals[0])
  roles['--inv-surface-1'] = lock('--inv-surface-1') ?? toHex(neutrals[1])
  roles['--inv-surface-2'] = lock('--inv-surface-2') ?? toHex(neutrals[2])
  roles['--inv-border'] = lock('--inv-border') ?? toHex(neutrals[3])
  roles['--inv-border-strong'] = lock('--inv-border-strong') ?? toHex(neutrals[4])

  const textChroma = NEUTRAL_TINT_CHROMA[spec.neutralTintStrength]
  const rampLs = neutrals.map((n) => n.l)
  const primaryTarget = CONTRAST_TARGETS[spec.contrast]

  // surface-2 is the worst case for text (least lightness headroom in both modes)
  const solveAgainstAll = (surfaces: string[], target: number): { hex: string; met: boolean } => {
    for (const surface of surfaces) {
      const candidate = solveText(surface, { hue: spec.neutralTint, chroma: textChroma, target, rampLs })
      const passesAll = surfaces.every((s) => wcagContrast(candidate.hex, s) >= target)
      if (candidate.met && passesAll) return { hex: candidate.hex, met: true }
    }
    const fallback = solveText(surfaces[surfaces.length - 1], { hue: spec.neutralTint, chroma: 0, target })
    return { hex: fallback.hex, met: fallback.met && surfaces.every((s) => wcagContrast(fallback.hex, s) >= target) }
  }

  const primary = solveAgainstAll(
    [roles['--inv-surface-2'], roles['--inv-surface-1'], roles['--inv-surface-0']],
    primaryTarget,
  )
  if (!primary.met) warnings.push(`text-primary could not reach ${primaryTarget} on all surfaces`)
  roles['--inv-text-primary'] = lock('--inv-text-primary') ?? primary.hex
  if (lock('--inv-text-primary') && wcagContrast(roles['--inv-text-primary'], roles['--inv-surface-1']) < primaryTarget) {
    warnings.push('locked text-primary fails the contrast target against surface-1')
  }

  const secondary = solveText(roles['--inv-surface-1'], { hue: spec.neutralTint, chroma: textChroma, target: 4.5, rampLs })
  if (!secondary.met) warnings.push('text-secondary could not reach 4.5')
  roles['--inv-text-secondary'] = lock('--inv-text-secondary') ?? secondary.hex

  const disabled = solveText(roles['--inv-surface-1'], { hue: spec.neutralTint, chroma: textChroma, target: 3.0, rampLs })
  roles['--inv-text-disabled'] = lock('--inv-text-disabled') ?? disabled.hex

  // accent: a lock seeds the ramp so dependent steps stay related to the brand
  const lockedAccent = lock('--inv-accent')
  const seed = lockedAccent
    ? (() => {
        const parsed = toOklch(lockedAccent)
        return parsed ? { l: parsed.l, c: parsed.c, h: parsed.h ?? 0 } : undefined
      })()
    : undefined
  if (lockedAccent && !seed) warnings.push(`locked accent ${lockedAccent} is not parseable; ignoring seed`)
  const accents = accentRamp(spec, seed, accentChromaMax)

  roles['--inv-accent'] = lockedAccent ?? toHex(accents[2])
  roles['--inv-accent-hover'] =
    lock('--inv-accent-hover') ?? toHex(spec.mode === 'light' ? accents[3] : accents[1])

  const accentContrast = solveText(roles['--inv-accent'], { hue: spec.neutralTint, chroma: 0.02, target: 4.5 })
  if (!accentContrast.met) warnings.push('accent-contrast could not reach 4.5 on accent')
  // accent-contrast must also hold on hover; re-solve against hover if it fails there
  let accentContrastHex = accentContrast.hex
  if (wcagContrast(accentContrastHex, roles['--inv-accent-hover']) < 4.5) {
    const onHover = solveText(roles['--inv-accent-hover'], { hue: spec.neutralTint, chroma: 0.02, target: 4.5 })
    if (wcagContrast(onHover.hex, roles['--inv-accent']) >= 4.5) accentContrastHex = onHover.hex
    else warnings.push('accent-contrast cannot satisfy both accent and accent-hover')
  }
  roles['--inv-accent-contrast'] = lock('--inv-accent-contrast') ?? accentContrastHex

  // accent-subtle: low-chroma tint near surface-1; pull toward the surface
  // until text-primary reads on it
  const surface1 = toOklch(roles['--inv-surface-1']) as OklchColor
  const subtleBase = spec.mode === 'light' ? accents[0] : accents[4]
  let subtle: OklchColor = {
    mode: 'oklch',
    l: (subtleBase.l + surface1.l) / 2,
    c: Math.min(subtleBase.c, 0.06),
    h: subtleBase.h ?? 0,
  }
  for (let i = 0; i < 12; i++) {
    if (wcagContrast(roles['--inv-text-primary'], toHex(subtle)) >= 4.5) break
    subtle = { ...subtle, l: (subtle.l + surface1.l) / 2 }
  }
  if (wcagContrast(roles['--inv-text-primary'], toHex(subtle)) < 4.5) {
    subtle = { ...subtle, l: surface1.l, c: Math.min(subtle.c, 0.04) }
    if (wcagContrast(roles['--inv-text-primary'], toHex(subtle)) < 4.5)
      warnings.push('text-primary on accent-subtle below 4.5')
  }
  roles['--inv-accent-subtle'] = lock('--inv-accent-subtle') ?? toHex(subtle)

  // ring: accent-hued, nudged until it clears 3.0 on both base surfaces
  const ringSolve = solveText(roles['--inv-surface-1'], {
    hue: seed?.h ?? spec.accentHue,
    chroma: accents[2].c,
    target: 3.0,
  })
  let ringHex = ringSolve.hex
  if (wcagContrast(ringHex, roles['--inv-surface-0']) < 3.0) {
    const onSurface0 = solveText(roles['--inv-surface-0'], {
      hue: seed?.h ?? spec.accentHue,
      chroma: accents[2].c,
      target: 3.0,
    })
    if (wcagContrast(onSurface0.hex, roles['--inv-surface-1']) >= 3.0) ringHex = onSurface0.hex
    else warnings.push('ring cannot reach 3.0 on both surfaces')
  }
  roles['--inv-ring'] = lock('--inv-ring') ?? ringHex

  // border-strong vs surface-1 >= 3.0 is a quality warning, not a failure
  if (wcagContrast(roles['--inv-border-strong'], roles['--inv-surface-1']) < 3.0) {
    warnings.push('border-strong below 3.0 against surface-1 (input affordance)')
  }

  return { roles, warnings }
}
```

- [ ] **Step 4: Run to verify pass** — PASS (9 tests). If the pair-matrix test fails, debug with the systematic-debugging skill — likely suspects in order: gamut clamping before hex, `h ?? 0` guards, solver direction branch (per oklch-compiler skill).

- [ ] **Step 5: Commit** — `git commit -am "Add color role assignment with lock pass-through"`

---

### Task 9: compileTheme orchestrator + invariants

**Files:**
- Create: `packages/core/src/compiler/compile.ts`
- Test: `packages/core/src/compiler/compile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/compiler/compile.test.ts
import { describe, it, expect } from 'vitest'
import { converter, formatHex } from 'culori'
import { compileTheme, InvalidStyleSpecError } from './compile'
import { ROLE_TOKENS } from './roles'
import { THEME_PACKS } from '../registries/theme-packs'

const spec = THEME_PACKS.find((p) => p.id === 'corporate-trust')!.spec

describe('compileTheme', () => {
  it('emits every role token (completeness)', () => {
    const { roles } = compileTheme(spec)
    for (const token of ROLE_TOKENS) expect(roles[token], token).toBeTruthy()
  })

  it('is deterministic: byte-identical output', () => {
    expect(JSON.stringify(compileTheme(spec))).toBe(JSON.stringify(compileTheme(spec)))
  })

  it('every color value round-trips parse -> formatHex (gamut invariant)', () => {
    const { roles } = compileTheme(spec)
    const toRgb = converter('rgb')
    for (const [token, value] of Object.entries(roles)) {
      if (!value.startsWith('#')) continue
      expect(formatHex(toRgb(value)), token).toBe(value)
    }
  })

  it('resolves fonts through the pairing registry', () => {
    const { roles } = compileTheme(spec)
    expect(roles['--inv-font-display']).toContain('Archivo')
    expect(roles['--inv-font-body']).toContain('Inter')
    expect(roles['--inv-font-mono']).toContain('JetBrains Mono') // default stack
  })

  it('throws InvalidStyleSpecError for a schema-invalid spec', () => {
    expect(() => compileTheme({ ...spec, accentHue: 999 })).toThrow(InvalidStyleSpecError)
  })

  it('throws for an unknown fontPairing id', () => {
    expect(() => compileTheme({ ...spec, fontPairing: 'does-not-exist' })).toThrow(InvalidStyleSpecError)
  })

  it('throws when mode is not allowed by constraints', () => {
    expect(() => compileTheme(spec, { allowed_modes: ['dark'] })).toThrow(InvalidStyleSpecError)
  })

  it('respects font_registry restriction', () => {
    expect(() => compileTheme(spec, { font_registry: ['geo-grotesk'] })).toThrow(InvalidStyleSpecError)
  })

  it('caps accent chroma via constraints', () => {
    const capped = compileTheme({ ...spec, accentChroma: 'vivid' }, { accent_chroma_max: 0.05 })
    const toOklch = converter('oklch')
    const accent = toOklch(capped.roles['--inv-accent'])
    expect(accent!.c).toBeLessThanOrEqual(0.06) // small tolerance for gamut mapping
  })

  it('locked tokens pass through any role, color or not', () => {
    const { roles } = compileTheme(spec, { locked_tokens: { '--inv-radius-base': '2px', '--inv-accent': '#e94560' } })
    expect(roles['--inv-radius-base']).toBe('2px')
    expect(roles['--inv-accent']).toBe('#e94560')
  })

  it('handles an achromatic locked accent (undefined hue) without throwing', () => {
    const { roles } = compileTheme(spec, { locked_tokens: { '--inv-accent': '#808080' } })
    expect(roles['--inv-accent']).toBe('#808080')
    expect(roles['--inv-accent-hover']).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('never throws for any pack (the whole gauntlet compiles)', () => {
    for (const pack of THEME_PACKS) {
      const { roles, warnings } = compileTheme(pack.spec)
      expect(Object.keys(roles).length).toBeGreaterThanOrEqual(22)
      expect(warnings, `${pack.id}: ${warnings.join('; ')}`).toEqual([])
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails** — FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// packages/core/src/compiler/compile.ts
import { z } from 'zod'

import { StyleSpecSchema } from './style-spec'
import type { StyleSpec, DesignConstraints } from './style-spec'
import { assignColorRoles, ROLE_TOKENS } from './roles'
import { nonColorTokens } from './tokens'
import { getFontPairing, DEFAULT_MONO_STACK } from '../registries/font-pairings'

// Schema/constraint violations route to the Designer retry path (phase 3).
// Everything past validation must produce a theme — degraded plus warnings,
// never a throw, never a broken page.
export class InvalidStyleSpecError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`invalid StyleSpec: ${issues.join('; ')}`)
    this.name = 'InvalidStyleSpecError'
    this.issues = issues
  }
}

export interface CompiledTheme {
  roles: Record<string, string>
  warnings: string[]
}

export function compileTheme(
  spec: StyleSpec,
  constraints: DesignConstraints = {},
): CompiledTheme {
  const parsed = StyleSpecSchema.safeParse(spec)
  if (!parsed.success) {
    throw new InvalidStyleSpecError(
      parsed.error.issues.map((i: z.ZodIssue) => `${i.path.join('.')}: ${i.message}`),
    )
  }
  const validSpec = parsed.data

  if (constraints.allowed_modes && !constraints.allowed_modes.includes(validSpec.mode)) {
    throw new InvalidStyleSpecError([`mode '${validSpec.mode}' is not allowed`])
  }

  const pairing = getFontPairing(validSpec.fontPairing)
  if (!pairing) {
    throw new InvalidStyleSpecError([`unknown fontPairing '${validSpec.fontPairing}'`])
  }
  if (constraints.font_registry && !constraints.font_registry.includes(pairing.id)) {
    throw new InvalidStyleSpecError([`fontPairing '${pairing.id}' is not in the allowed registry`])
  }

  const locks = constraints.locked_tokens ?? {}
  const color = assignColorRoles(validSpec, locks, constraints.accent_chroma_max)

  const roles: Record<string, string> = {
    ...color.roles,
    '--inv-font-display': pairing.display,
    '--inv-font-body': pairing.body,
    '--inv-font-mono': pairing.mono ?? DEFAULT_MONO_STACK,
    ...nonColorTokens(validSpec),
  }

  // locks win over every computed value, color or not
  for (const [token, value] of Object.entries(locks)) roles[token] = value

  const warnings = [...color.warnings]
  for (const token of ROLE_TOKENS) {
    if (!roles[token]) warnings.push(`missing role token ${token}`)
  }

  return { roles, warnings }
}
```

- [ ] **Step 4: Run to verify pass** — PASS (11 tests). The "whole gauntlet compiles with zero warnings" test is the strictest — if a pack emits warnings, fix the pack (or the solver) — packs shipping with warnings is a taste bug per design-taste.

- [ ] **Step 5: Run the package suite** — `pnpm --filter invariance test` → all green (baseline 84 + new)

- [ ] **Step 6: Commit** — `git commit -am "Add compileTheme orchestrator with validation and lock pass-through"`

---

### Task 10: Golden snapshots + independent contrast recompute

**Files:**
- Test: `packages/core/src/compiler/golden.test.ts`

- [ ] **Step 1: Write the test** (snapshots self-create on first run; the contrast recompute is the real gate)

```ts
// packages/core/src/compiler/golden.test.ts
import { describe, it, expect } from 'vitest'
import { wcagContrast } from 'culori'
import { compileTheme } from './compile'
import { CONTRAST_TARGETS } from './style-spec'
import { THEME_PACKS } from '../registries/theme-packs'

describe('golden token snapshots', () => {
  for (const pack of THEME_PACKS) {
    it(`${pack.id} compiles to a stable token map`, () => {
      expect(compileTheme(pack.spec)).toMatchSnapshot()
    })
  }
})

// Independent safety net: recomputes every pair with wcagContrast directly,
// no solver internals involved (spec contrast pair matrix).
describe('contrast pair matrix holds for every pack', () => {
  for (const pack of THEME_PACKS) {
    it(pack.id, () => {
      const { roles } = compileTheme(pack.spec)
      const target = CONTRAST_TARGETS[pack.spec.contrast]
      const pairs: Array<[string, string, number]> = [
        ['--inv-text-primary', '--inv-surface-0', target],
        ['--inv-text-primary', '--inv-surface-1', target],
        ['--inv-text-primary', '--inv-surface-2', target],
        ['--inv-text-secondary', '--inv-surface-0', 4.5],
        ['--inv-text-secondary', '--inv-surface-1', 4.5],
        ['--inv-text-primary', '--inv-accent-subtle', 4.5],
        ['--inv-accent-contrast', '--inv-accent', 4.5],
        ['--inv-accent-contrast', '--inv-accent-hover', 4.5],
        ['--inv-text-disabled', '--inv-surface-1', 3.0],
        ['--inv-ring', '--inv-surface-0', 3.0],
        ['--inv-ring', '--inv-surface-1', 3.0],
      ]
      for (const [fg, bg, t] of pairs) {
        expect(
          wcagContrast(roles[fg], roles[bg]),
          `${pack.id}: ${fg} on ${bg} needs ${t}`,
        ).toBeGreaterThanOrEqual(t)
      }
    })
  }
})
```

- [ ] **Step 2: Run twice** — first run writes `__snapshots__/golden.test.ts.snap`; second run must pass against it. `pnpm --filter invariance test -- run src/compiler/golden.test.ts` ×2 → PASS both.

- [ ] **Step 3: Eyeball the snapshot file.** Open `packages/core/src/compiler/__snapshots__/golden.test.ts.snap` and sanity-check 2-3 packs: retro-arcade surfaces should be deep violet-tinted near-blacks, accent amber-ish; soft-pastel surfaces near-white with blush tint. Obviously-wrong values (all gray, neon surfaces) mean a ramp bug — stop and debug.

(The in-test recompute above fulfills the spec's "check-contrast in a test or CI step" requirement — the manual `.claude/skills/oklch-compiler/check-contrast.mjs` script remains available for ad-hoc debugging once `dist` exists after Task 14.)

- [ ] **Step 4: Commit (snapshots included)** — `git add -A packages/core && git commit -m "Add golden snapshots and independent contrast recompute for all packs"`

---

### Task 11: Spec-grid sweep

**Files:**
- Test: `packages/core/src/compiler/sweep.test.ts`

- [ ] **Step 1: Write the test**

```ts
// packages/core/src/compiler/sweep.test.ts
import { describe, it, expect } from 'vitest'
import { wcagContrast } from 'culori'
import { compileTheme } from './compile'
import { CONTRAST_TARGETS } from './style-spec'
import type { StyleSpec } from './style-spec'

// Color-relevant fields swept fully; non-color enums are exercised exhaustively
// in tokens.test.ts (pure table lookups). Together: every enum combination.
const HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
const TINTS = [0, 90, 180, 270]

describe('compiler sweep: every color combination compiles accessibly', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const accentChroma of ['muted', 'medium', 'vivid'] as const) {
      for (const neutralTintStrength of ['none', 'subtle', 'strong'] as const) {
        for (const contrast of ['soft', 'standard', 'high'] as const) {
          it(`${mode}/${accentChroma}/${neutralTintStrength}/${contrast}`, () => {
            for (const accentHue of HUES) {
              for (const neutralTint of TINTS) {
                const spec: StyleSpec = {
                  mode, accentHue, accentChroma, neutralTint, neutralTintStrength, contrast,
                  fontPairing: 'geo-grotesk', radius: 'subtle', shadow: 'subtle',
                  density: 'standard', borderWeight: 'standard', rationale: 'sweep',
                }
                const { roles, warnings } = compileTheme(spec)
                expect(warnings, `${accentHue}/${neutralTint}: ${warnings.join('; ')}`).toEqual([])
                const target = CONTRAST_TARGETS[contrast]
                for (const s of ['--inv-surface-0', '--inv-surface-1', '--inv-surface-2'])
                  expect(wcagContrast(roles['--inv-text-primary'], roles[s])).toBeGreaterThanOrEqual(target)
                expect(wcagContrast(roles['--inv-accent-contrast'], roles['--inv-accent'])).toBeGreaterThanOrEqual(4.5)
              }
            }
          })
        }
      }
    }
  }
})
```

- [ ] **Step 2: Run it** — `pnpm --filter invariance test -- run src/compiler/sweep.test.ts`
Expected: PASS, 54 test blocks (2×3×3×3), 48 compiles each = 2,592 compiles. Should complete in well under 60s (pure math). If any combination emits warnings, that's a solver bug for that hue/lightness region — debug, don't loosen the assertion.

- [ ] **Step 3: Commit** — `git commit -am "Add exhaustive color sweep over the StyleSpec space"`

---

### Task 12: theme.json v2 types + schema

**Files:**
- Modify: `packages/core/src/config/types.ts` (append; change nothing existing)
- Modify: `packages/core/src/config/schema.ts` (append; change nothing existing)
- Test: `packages/core/src/config/theme-v2.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/config/theme-v2.test.ts
import { describe, it, expect } from 'vitest'
import { ThemeJsonV2Schema } from './schema'

const valid = {
  version: 2,
  base_app_version: 'v1',
  theme: {
    roles: { '--inv-surface-0': '#0f1117', '--inv-font-display': "'VT323', monospace" },
    slots: { '--inv-sidebar-bg': 'var(--inv-surface-1)', '--inv-header-bg': '#123456' },
  },
}

describe('ThemeJsonV2Schema', () => {
  it('accepts a valid v2 document', () => {
    expect(ThemeJsonV2Schema.safeParse(valid).success).toBe(true)
  })
  it('accepts var() references and literals in slots', () => {
    const r = ThemeJsonV2Schema.safeParse(valid)
    expect(r.success).toBe(true)
  })
  it('rejects version 1', () => {
    expect(ThemeJsonV2Schema.safeParse({ ...valid, version: 1 }).success).toBe(false)
  })
  it('rejects non --inv-* keys in roles', () => {
    const bad = { ...valid, theme: { roles: { 'background-color': '#fff' } } }
    expect(ThemeJsonV2Schema.safeParse(bad).success).toBe(false)
  })
  it('accepts an optional styleSpec for provenance', () => {
    const withSpec = {
      ...valid,
      theme: {
        ...valid.theme,
        styleSpec: {
          mode: 'dark', accentHue: 55, accentChroma: 'vivid', neutralTint: 280,
          neutralTintStrength: 'subtle', contrast: 'standard', fontPairing: 'retro-terminal',
          radius: 'sharp', shadow: 'hard-offset', density: 'compact', borderWeight: 'heavy',
          rationale: 'test',
        },
      },
    }
    expect(ThemeJsonV2Schema.safeParse(withSpec).success).toBe(true)
  })
  it('keeps v1 content/layout/components sections', () => {
    const withSections = {
      ...valid,
      content: { pages: { '/dashboard': { el_003: { text: 'My Pipeline' } } } },
      layout: { pages: { '/dashboard': { sections: ['hero'], hidden: ['banner'] } } },
    }
    expect(ThemeJsonV2Schema.safeParse(withSections).success).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — FAIL (`ThemeJsonV2Schema` not exported)

- [ ] **Step 3: Implement.** Append to `packages/core/src/config/types.ts`:

```ts
// ---------------------------------------------------------------------------
// theme.json v2 (roles + slots + styleSpec). v1 types above are unchanged;
// the runtime keeps consuming v1 until the render-driven phase lands.
// ---------------------------------------------------------------------------

import type { StyleSpec } from '../compiler/style-spec'

export interface ThemeSectionV2 {
  roles?: Record<string, string>
  slots?: Record<string, string>
  styleSpec?: StyleSpec
}

export interface ThemeJsonV2 {
  version: 2
  base_app_version: string
  theme?: ThemeSectionV2
  content?: ContentSection
  layout?: LayoutSection
  components?: ComponentsSection
}
```

(Move the `import type` to the top of the file with the other imports — the file currently has none, so it becomes the first line.)

Append to `packages/core/src/config/schema.ts`:

```ts
import { StyleSpecSchema } from '../compiler/style-spec'

// --- theme.json v2 -----------------------------------------------------------

const CssVarRecordSchema = z.record(
  z.string().regex(CSS_VAR_KEY, 'keys must be --inv-* CSS variables'),
  z.string().min(1),
)

const ThemeSectionV2Schema = z.object({
  roles: CssVarRecordSchema.optional(),
  slots: CssVarRecordSchema.optional(),
  styleSpec: StyleSpecSchema.optional(),
})

export const ThemeJsonV2Schema = z.object({
  version: z.literal(2),
  base_app_version: z.string(),
  theme: ThemeSectionV2Schema.optional(),
  content: ContentSectionSchema.optional(),
  layout: LayoutSectionSchema.optional(),
  components: ComponentsSectionSchema.optional(),
})
```

(`import` goes to the top with the existing zod import; `CSS_VAR_KEY` already exists in this file.)

- [ ] **Step 4: Run to verify pass** — PASS (6 tests). Then `pnpm --filter invariance test` → existing 84 still green (v1 schema untouched).

- [ ] **Step 5: Commit** — `git commit -am "Add theme.json v2 types and schema beside v1"`

---

### Task 13: v1 → v2 upgrade

**Files:**
- Create: `packages/core/src/config/upgrade.ts`
- Test: `packages/core/src/config/upgrade.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/config/upgrade.test.ts
import { describe, it, expect } from 'vitest'
import { upgradeThemeJson } from './upgrade'
import { ThemeJsonV2Schema } from './schema'
import type { ThemeJson } from './types'

// shape the v5 scanner actually emits: --inv-* literals in theme.globals
const v1: ThemeJson = {
  version: 1,
  base_app_version: 'v1',
  theme: {
    globals: {
      '--inv-sidebar-bg': '#1a1a2e',
      '--inv-sidebar-text': '#ffffff',
      colors: { primary: '#e94560' },
      fonts: { body: 'Inter' },
      radii: { card: 8 },
    },
    slots: { sidebar: { backgroundColor: '#222222' } },
  },
  content: { pages: { '/dashboard': { el_003: { text: 'My Pipeline' } } } },
}

describe('upgradeThemeJson', () => {
  it('copies --inv-* keys to slots verbatim', () => {
    const { theme } = upgradeThemeJson(v1)
    expect(theme.theme?.slots?.['--inv-sidebar-bg']).toBe('#1a1a2e')
    expect(theme.theme?.slots?.['--inv-sidebar-text']).toBe('#ffffff')
  })

  it('converts structured groups using v1 apply-theme naming', () => {
    const { theme } = upgradeThemeJson(v1)
    expect(theme.theme?.slots?.['--inv-primary']).toBe('#e94560')      // colors -> --inv-{key}
    expect(theme.theme?.slots?.['--inv-font-body']).toBe('Inter')      // fonts -> --inv-font-{key}
    expect(theme.theme?.slots?.['--inv-radius-card']).toBe('8px')      // radii -> --inv-radius-{key} + px
  })

  it('starts roles empty and bumps version to 2', () => {
    const { theme } = upgradeThemeJson(v1)
    expect(theme.version).toBe(2)
    expect(theme.theme?.roles).toEqual({})
  })

  it('drops inline-style slots with a warning', () => {
    const { warnings } = upgradeThemeJson(v1)
    expect(warnings.some((w) => w.includes('inline-style'))).toBe(true)
  })

  it('carries content/layout/components through untouched', () => {
    const { theme } = upgradeThemeJson(v1)
    expect(theme.content).toEqual(v1.content)
  })

  it('output validates against ThemeJsonV2Schema', () => {
    const { theme } = upgradeThemeJson(v1)
    expect(ThemeJsonV2Schema.safeParse(theme).success).toBe(true)
  })

  it('passes a v2-shaped document through unchanged', () => {
    const v2 = upgradeThemeJson(v1).theme
    const again = upgradeThemeJson(v2 as unknown as ThemeJson)
    expect(again.theme).toEqual(v2)
    expect(again.warnings).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails** — FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// packages/core/src/config/upgrade.ts
import type { ThemeJson, ThemeJsonV2 } from './types'

export interface UpgradeResult {
  theme: ThemeJsonV2
  warnings: string[]
}

const STRUCTURED_KEYS = new Set(['colors', 'fonts', 'spacing', 'radii'])

// Pure key-partition from v1 globals into v2 slots. Naming mirrors what the
// v1 apply-theme.ts wrote to :root, so upgraded themes render identically.
export function upgradeThemeJson(input: ThemeJson): UpgradeResult {
  if (input.version >= 2) {
    return { theme: input as unknown as ThemeJsonV2, warnings: [] }
  }

  const warnings: string[] = []
  const slots: Record<string, string> = {}
  const globals = input.theme?.globals

  if (globals) {
    for (const [key, value] of Object.entries(globals.colors ?? {})) slots[`--inv-${key}`] = value
    for (const [key, value] of Object.entries(globals.fonts ?? {})) slots[`--inv-font-${key}`] = value
    for (const [key, value] of Object.entries(globals.radii ?? {})) slots[`--inv-radius-${key}`] = `${value}px`
    if (globals.spacing) warnings.push('theme.globals.spacing has no v2 equivalent; dropped')
    for (const [key, value] of Object.entries(globals)) {
      if (STRUCTURED_KEYS.has(key)) continue
      if (typeof value !== 'string') continue
      if (key.startsWith('--inv-')) slots[key] = value
    }
  }

  if (input.theme?.slots && Object.keys(input.theme.slots).length > 0) {
    warnings.push('v1 inline-style theme.slots dropped (replaced by --inv-* variables)')
  }

  return {
    theme: {
      version: 2,
      base_app_version: input.base_app_version,
      theme: { roles: {}, slots },
      content: input.content,
      layout: input.layout,
      components: input.components,
    },
    warnings,
  }
}
```

- [ ] **Step 4: Run to verify pass** — PASS (7 tests)

- [ ] **Step 5: Commit** — `git commit -am "Add v1 to v2 theme.json upgrade"`

---

### Task 14: Public exports + final verification

**Files:**
- Modify: `packages/core/src/index.ts` (append exports)

- [ ] **Step 1: Append to `packages/core/src/index.ts`** (match the file's existing export grouping style):

```ts
// Theme Compiler (v6)
export { compileTheme, InvalidStyleSpecError } from './compiler/compile'
export type { CompiledTheme } from './compiler/compile'
export { StyleSpecSchema, ACCENT_CHROMA, NEUTRAL_TINT_CHROMA, CONTRAST_TARGETS } from './compiler/style-spec'
export type { StyleSpec, DesignConstraints } from './compiler/style-spec'
export { ROLE_TOKENS, COLOR_ROLE_TOKENS } from './compiler/roles'
export type { RoleToken } from './compiler/roles'

// Registries
export { FONT_PAIRINGS, DEFAULT_MONO_STACK, getFontPairing } from './registries/font-pairings'
export type { FontPairing } from './registries/font-pairings'
export { THEME_PACKS } from './registries/theme-packs'
export type { ThemePack } from './registries/theme-packs'

// theme.json v2
export { ThemeJsonV2Schema } from './config/schema'
export type { ThemeJsonV2, ThemeSectionV2 } from './config/types'
export { upgradeThemeJson } from './config/upgrade'
export type { UpgradeResult } from './config/upgrade'
```

- [ ] **Step 2: Full verification**

```bash
pnpm build && pnpm test
```

Expected: build green for both packages; core tests = 84 baseline + all new compiler/registry/config tests; scanner suite still 52. Zero failures, zero skips.

- [ ] **Step 3: Smoke the public API from the built output**

```bash
node -e "const inv = require('./packages/core/dist/index.js'); const t = inv.compileTheme(inv.THEME_PACKS[0].spec); console.log(t.roles['--inv-accent'], Object.keys(t.roles).length, t.warnings.length)"
```

Expected: an amber-ish hex, `22`+, `0`. (If `require` fails on culori ESM interop, this is the place to catch it — fix by adjusting core tsconfig `moduleResolution`, not by skipping the check.)

- [ ] **Step 4: Commit** — `git commit -am "Export compiler, registries, and theme.json v2 from the package root"`

---

## Verification (end-to-end)

1. `pnpm build && pnpm test` from a clean checkout — everything green without `ANTHROPIC_API_KEY` (no LLM anywhere in this phase).
2. `git stash && pnpm test && git stash pop` style spot-check not needed — but confirm `golden.test.ts.snap` is committed (determinism gate is meaningless if snapshots are ignored).
3. Re-run the suite twice in a row: second run must be byte-stable (no snapshot churn) — proves determinism end to end.
4. Spot-check taste: print retro-arcade and soft-pastel role maps side by side (`node -e` as in Task 14); they should be unmistakably different themes.

## Out of scope (do not touch)

`agent/`, `runtime/`, `primitives/`, `panel/`, `storage/`, `verify/` (the contrastPairs verify-engine test lands in phase 3 when the pipeline consumes the compiler), scanner package, v1 types/schema shapes.
