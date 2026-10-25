import { describe, it, expect } from 'vitest'
import { wcagContrast } from 'culori'

import { compileTheme } from './compile'
import { CONTRAST_TARGETS } from './style-spec'
import { contrastPairs } from './contrast-pairs'
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
      const pairs = contrastPairs(target)
      for (const [fg, bg, t] of pairs) {
        expect(
          wcagContrast(roles[fg], roles[bg]),
          `${pack.id}: ${fg} on ${bg} needs ${t}`,
        ).toBeGreaterThanOrEqual(t)
      }
    })
  }
})
