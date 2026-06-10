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
