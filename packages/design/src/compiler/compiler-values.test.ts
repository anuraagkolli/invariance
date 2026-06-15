import { describe, it, expect } from 'vitest'

import { isSafeCssTokenValue } from '@invariance/design-schema'
import type { StyleSpec } from './style-spec'
import { compileTheme } from './compile'
import { THEME_PACKS } from '../registries/theme-packs'
import { FONT_PAIRINGS, DEFAULT_MONO_STACK } from '../registries/font-pairings'

// The exact spec + constraints the demo's gen-default-tokens.mjs feeds the
// compiler to produce apps/demo globals.css. Pinned here so the demo's
// generated token values are part of the allowlist guard, not just the packs.
const DEMO_DEFAULT_SPEC: StyleSpec = {
  mode: 'dark',
  accentHue: 12,
  accentChroma: 'vivid',
  neutralTint: 255,
  neutralTintStrength: 'subtle',
  contrast: 'standard',
  fontPairing: 'geo-grotesk',
  radius: 'subtle',
  shadow: 'subtle',
  density: 'standard',
  borderWeight: 'hairline',
  rationale: 'Nebula default: deep cool dark with one crimson accent.',
}

// THE KEY GUARD. The CSS-token-value allowlist (the cookie-injection fix) is
// only safe if it accepts 100% of legitimate compiler/scanner/registry output.
// If the compiler ever emits a value the grammar rejects, a real theme would be
// silently dropped on load — so this test compiles every pack under every
// constraint variant the pipeline uses and asserts each emitted value passes.
// A failure here means EITHER the compiler produced an unexpected value OR the
// grammar is too tight; widen the grammar precisely, never the compiler output.

const CONSTRAINT_VARIANTS = [
  {},
  { contrast: 4.5, accent_chroma_max: 0.25 },
  // The invariant floor path (raises contrast targets, exercises more solves).
  { contrast: 7.0, accent_chroma_max: 0.25 },
  // The locked-accent path (brand lock seeds the ramp).
  { contrast: 4.5, accent_chroma_max: 0.25, locked_tokens: { '--inv-accent': '#e94560' } },
] as const

describe('compiler output is always a safe CSS token value', () => {
  it('every role value of every pack under every constraint variant passes the allowlist', () => {
    for (const pack of THEME_PACKS) {
      for (const constraints of CONSTRAINT_VARIANTS) {
        let compiled
        try {
          compiled = compileTheme(pack.spec, constraints)
        } catch {
          // Some variants legitimately throw (e.g. a locked accent the pack's
          // mode disallows); a throw means no value is emitted, nothing to check.
          continue
        }
        for (const [token, value] of Object.entries(compiled.roles)) {
          expect(
            isSafeCssTokenValue(value),
            `pack ${pack.id} / ${JSON.stringify(constraints)} / ${token} = ${JSON.stringify(value)}`,
          ).toBe(true)
        }
      }
    }
  })

  it('every registry font stack passes the allowlist', () => {
    // Font stacks are written verbatim into --inv-font-* tokens; the scanner and
    // demo also emit them, so the registry is the canonical font-value corpus.
    for (const pairing of FONT_PAIRINGS) {
      for (const stack of [pairing.display, pairing.body, pairing.mono].filter(Boolean) as string[]) {
        expect(isSafeCssTokenValue(stack), `pairing ${pairing.id}: ${stack}`).toBe(true)
      }
    }
    expect(isSafeCssTokenValue(DEFAULT_MONO_STACK), DEFAULT_MONO_STACK).toBe(true)
  })

  it('every demo default token (apps/demo globals.css) passes the allowlist', () => {
    const { roles } = compileTheme(DEMO_DEFAULT_SPEC, { contrast: 4.5, accent_chroma_max: 0.25 })
    for (const [token, value] of Object.entries(roles)) {
      expect(isSafeCssTokenValue(value), `demo ${token} = ${JSON.stringify(value)}`).toBe(true)
    }
    // The demo's slot tier is hand-written var() references; assert that shape too.
    for (const ref of ['var(--inv-surface-1)', 'var(--inv-text-primary)', 'var(--inv-surface-0)', 'var(--inv-border)', 'var(--inv-text-secondary)']) {
      expect(isSafeCssTokenValue(ref), ref).toBe(true)
    }
  })
})
