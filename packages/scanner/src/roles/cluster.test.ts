import { describe, it, expect } from 'vitest'
import { clusterColors } from './cluster'
import type { ColorObservation } from './cluster'

// The fixture app's observed colors, by kind. Mirrors what the extraction
// produces for packages/scanner/src/__fixtures__/simple-app:
//   #ffffff  bg   x2 (page div, main)
//   #ffffff  text x2 (aside color, button color)
//   #1a1a2e  bg   x1 (aside)
//   #1a1a2e  text x1 (p body copy)
//   #f3f4f6  bg   x1 (card div)
//   #e94560  bg   x1 (accent button)
function fixtureObservations(): ColorObservation[] {
  return [
    { hex: '#ffffff', kind: 'bg' },
    { hex: '#ffffff', kind: 'bg' },
    { hex: '#1a1a2e', kind: 'bg' },
    { hex: '#f3f4f6', kind: 'bg' },
    { hex: '#e94560', kind: 'bg' },
    { hex: '#ffffff', kind: 'text' },
    { hex: '#ffffff', kind: 'text' },
    { hex: '#1a1a2e', kind: 'text' },
  ]
}

describe('clusterColors — fixture app', () => {
  it('assigns the white page background to surface-0', () => {
    const { roles } = clusterColors(fixtureObservations())
    expect(roles['--inv-surface-0']).toBe('#FFFFFF')
  })

  it('takes the nearest-lightness neutral as surface-1', () => {
    // #f3f4f6 (near-white) is closer in L to surface-0 than #1a1a2e (near-black),
    // so it takes surface-1.
    const { roles } = clusterColors(fixtureObservations())
    expect(roles['--inv-surface-1']).toBe('#F3F4F6')
  })

  it('does NOT fill surface-2 with the dark panel that equals text-primary', () => {
    // #1a1a2e is both the body-text color (text-primary) and the sidebar panel
    // background. Filling surface-2 with it would make text-primary unreadable
    // on surface-2 (1:1) — the seed would fail its own contrast invariant. The
    // coherence guard leaves it as a slot literal instead.
    const { roles, warnings } = clusterColors(fixtureObservations())
    expect(roles['--inv-surface-2']).toBeUndefined()
    expect(warnings.some((w) => w.includes('dark panel'))).toBe(true)
  })

  it('excludes the chromatic background from the surface ramp', () => {
    // #e94560 is high-chroma (c > 0.07) — it is the accent, never a surface.
    const { roles } = clusterColors(fixtureObservations())
    const surfaces = [roles['--inv-surface-0'], roles['--inv-surface-1'], roles['--inv-surface-2']]
    expect(surfaces).not.toContain('#E94560')
  })

  it('assigns the highest-contrast text cluster to text-primary', () => {
    // #1a1a2e on white surface-0 = ~17:1, the highest-contrast readable text.
    const { roles } = clusterColors(fixtureObservations())
    expect(roles['--inv-text-primary']).toBe('#1A1A2E')
  })

  it('does not assign white-on-white text as a readable text role', () => {
    // #ffffff text on the white surface-0 has ~1:1 contrast — below the 3:1
    // floor; it must not become text-primary or text-secondary.
    const { roles } = clusterColors(fixtureObservations())
    expect(roles['--inv-text-primary']).not.toBe('#FFFFFF')
    expect(roles['--inv-text-secondary']).not.toBe('#FFFFFF')
  })

  it('assigns the high-chroma cluster to accent', () => {
    const { roles } = clusterColors(fixtureObservations())
    expect(roles['--inv-accent']).toBe('#E94560')
  })

  it('solves accent-contrast as black or white by WCAG contrast on the accent', () => {
    // White on #e94560 = 3.83 (FAIL); black = 5.48 (PASS). The higher-contrast
    // option wins — black, here.
    const { roles } = clusterColors(fixtureObservations())
    expect(roles['--inv-accent-contrast']).toBe('#000000')
  })

  it('seeds accent-hover with the accent hex (a placeholder for the compiler ramp)', () => {
    const { roles } = clusterColors(fixtureObservations())
    expect(roles['--inv-accent-hover']).toBe('#E94560')
  })

  it('maps each assigned (kind, hex) to its role', () => {
    const { varToRole } = clusterColors(fixtureObservations())
    expect(varToRole.get('bg:#FFFFFF')).toBe('--inv-surface-0')
    expect(varToRole.get('bg:#F3F4F6')).toBe('--inv-surface-1')
    expect(varToRole.get('bg:#E94560')).toBe('--inv-accent')
    // The dark hex used as text maps to text-primary.
    expect(varToRole.get('text:#1A1A2E')).toBe('--inv-text-primary')
    // As a background it is the coherence-dropped dark panel, so it has no
    // surface role and stays a slot literal.
    expect(varToRole.get('bg:#1A1A2E')).toBeUndefined()
  })

  it('warns about unfilled roles (no borders, no secondary text in the fixture)', () => {
    const { warnings } = clusterColors(fixtureObservations())
    expect(warnings.some((w) => w.includes('border'))).toBe(true)
  })
})

describe('clusterColors — clustering behavior', () => {
  it('merges near-identical OKLCH values into one cluster', () => {
    // #ffffff / #fefefe / #fafafa are within tolerance — one surface-0 cluster.
    const obs: ColorObservation[] = [
      { hex: '#ffffff', kind: 'bg' },
      { hex: '#fefefe', kind: 'bg' },
      { hex: '#fafafa', kind: 'bg' },
      { hex: '#1a1a2e', kind: 'bg' },
    ]
    const { roles } = clusterColors(obs)
    expect(roles['--inv-surface-0']).toBe('#FFFFFF')
    // Only two distinct neutral surfaces survived clustering: the near-white
    // group and the dark one — no surface-2 from a phantom third cluster.
    expect(roles['--inv-surface-1']).toBe('#1A1A2E')
    expect(roles['--inv-surface-2']).toBeUndefined()
  })

  it('picks the highest-count member as a cluster representative', () => {
    // #fafafa observed 3x dominates #ffffff observed 1x in the same cluster.
    const obs: ColorObservation[] = [
      { hex: '#ffffff', kind: 'bg' },
      { hex: '#fafafa', kind: 'bg' },
      { hex: '#fafafa', kind: 'bg' },
      { hex: '#fafafa', kind: 'bg' },
    ]
    const { roles } = clusterColors(obs)
    expect(roles['--inv-surface-0']).toBe('#FAFAFA')
  })

  it('does not treat a low-chroma near-neutral as an accent', () => {
    // #1a1a2e has c ~ 0.038, below the 0.07 accent threshold — it stays a surface,
    // and no accent role is filled when no chromatic cluster exists.
    const obs: ColorObservation[] = [
      { hex: '#ffffff', kind: 'bg' },
      { hex: '#1a1a2e', kind: 'bg' },
    ]
    const { roles, warnings } = clusterColors(obs)
    expect(roles['--inv-accent']).toBeUndefined()
    expect(warnings.some((w) => w.includes('accent'))).toBe(true)
  })

  it('assigns a second readable text cluster to text-secondary', () => {
    const obs: ColorObservation[] = [
      { hex: '#ffffff', kind: 'bg' },
      { hex: '#111111', kind: 'text' }, // ~19:1 — primary
      { hex: '#666666', kind: 'text' }, // ~5.7:1 — secondary
    ]
    const { roles } = clusterColors(obs)
    expect(roles['--inv-text-primary']).toBe('#111111')
    expect(roles['--inv-text-secondary']).toBe('#666666')
  })

  it('assigns border-kind clusters to border then border-strong by count', () => {
    const obs: ColorObservation[] = [
      { hex: '#ffffff', kind: 'bg' },
      { hex: '#e5e7eb', kind: 'border' },
      { hex: '#e5e7eb', kind: 'border' },
      { hex: '#9ca3af', kind: 'border' },
    ]
    const { roles } = clusterColors(obs)
    expect(roles['--inv-border']).toBe('#E5E7EB')
    expect(roles['--inv-border-strong']).toBe('#9CA3AF')
  })

  it('returns an empty assignment for no observations', () => {
    const { roles, varToRole } = clusterColors([])
    expect(Object.keys(roles)).toHaveLength(0)
    expect(varToRole.size).toBe(0)
  })

  it('is deterministic: same observations in, identical roles out', () => {
    const a = clusterColors(fixtureObservations())
    const b = clusterColors(fixtureObservations())
    expect(a.roles).toEqual(b.roles)
  })
})
