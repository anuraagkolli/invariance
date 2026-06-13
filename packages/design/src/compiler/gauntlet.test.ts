import { describe, it, expect } from 'vitest'

import { THEME_PACKS } from '../registries/theme-packs'
import { compileTheme } from './compile'
import { verifyRoleQuality, oklchOf } from './quality'

// The gauntlet sign-off, made hermetic: instead of screenshotting a live browser,
// we assert the compiler's scientific claims directly — every named pack compiles
// to a professionally-accessible (WCAG AA) theme, and the pack accents are
// mutually distinct. Deterministic, no browser, no LLM.
describe('gauntlet: every theme pack compiles to a distinct, AA-compliant theme', () => {
  const compiled = THEME_PACKS.map((p) => ({ id: p.id, roles: compileTheme(p.spec).roles }))

  it('compiles every pack', () => {
    expect(compiled.length).toBeGreaterThanOrEqual(10)
    for (const { id, roles } of compiled) {
      expect(Object.keys(roles).length, id).toBeGreaterThan(0)
    }
  })

  it('every pack meets the WCAG AA design-quality gate', () => {
    for (const { id, roles } of compiled) {
      const reasons = verifyRoleQuality(roles, { contrastFloor: 4.5 })
      expect(reasons, `${id}: ${reasons.join('; ')}`).toEqual([])
    }
  })

  it('pack accents are mutually distinct (OKLab ΔE ≥ 0.03)', () => {
    const toLab = (l: number, c: number, h: number) => ({
      L: l,
      a: c * Math.cos((h * Math.PI) / 180),
      b: c * Math.sin((h * Math.PI) / 180),
    })
    const accents = compiled.map(({ id, roles }) => {
      const ok = oklchOf(roles['--inv-accent'] ?? '')
      if (!ok) throw new Error(`${id} has no readable --inv-accent`)
      return { id, lab: toLab(ok.l, ok.c, ok.h) }
    })
    let closest = { pair: '', dE: Infinity }
    for (let i = 0; i < accents.length; i++) {
      for (let j = i + 1; j < accents.length; j++) {
        const A = accents[i]!.lab
        const B = accents[j]!.lab
        const dE = Math.hypot(A.L - B.L, A.a - B.a, A.b - B.b)
        if (dE < closest.dE) closest = { pair: `${accents[i]!.id} vs ${accents[j]!.id}`, dE }
      }
    }
    expect(closest.dE, `closest accent pair: ${closest.pair} (ΔE ${closest.dE.toFixed(3)})`).toBeGreaterThanOrEqual(0.03)
  })
})
