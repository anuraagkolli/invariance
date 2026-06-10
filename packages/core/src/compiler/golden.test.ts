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
        ['--inv-accent', '--inv-surface-0', 3.0],
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
