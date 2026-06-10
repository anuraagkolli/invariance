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

  it('accent-subtle emits valid hex', () => {
    const { roles } = assignColorRoles({ ...base, accentChroma: 'vivid' }, {})
    expect(roles['--inv-accent-subtle']).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('warns when a locked text token fails its floor', () => {
    const { roles, warnings } = assignColorRoles(base, { '--inv-text-secondary': '#eeeeee' })
    expect(roles['--inv-text-secondary']).toBe('#eeeeee')
    expect(warnings.some((w) => w.includes('locked text-secondary'))).toBe(true)
  })

  it('is deterministic', () => {
    expect(assignColorRoles(base, {})).toEqual(assignColorRoles(base, {}))
  })
})
