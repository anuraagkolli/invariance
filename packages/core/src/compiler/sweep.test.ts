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
