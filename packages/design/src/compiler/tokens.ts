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

// Display typography knobs. Driven by spec.typography, NOT density: a theme's
// headline treatment (all-caps wide tracking vs. tight editorial) is a distinct
// taste axis from how tightly the layout packs. Weight/tracking/transform are
// the three CSS properties a display face needs to express a voice; the font
// FAMILY itself comes from the pairing registry, these are the modulation.
const TYPOGRAPHY_TABLE: Record<
  NonNullable<StyleSpec['typography']>,
  { transform: string; tracking: string; weight: string }
> = {
  standard: { transform: 'none', tracking: '0', weight: '600' },
  'display-caps': { transform: 'uppercase', tracking: '0.08em', weight: '700' },
  editorial: { transform: 'none', tracking: '-0.01em', weight: '400' },
  technical: { transform: 'uppercase', tracking: '0.04em', weight: '500' },
}

// Spacing ramp. Keyed by density so the SAME knob that sets --inv-density-unit
// also scales the whole spacing system coherently: compact themes get tighter
// gaps everywhere, comfortable themes breathe. Seven steps (2xs…2xl) cover the
// full layout range so consumers never hand-pick a px value off the scale.
const SPACE_SCALE: Record<StyleSpec['density'], Record<string, string>> = {
  compact: {
    '--inv-space-2xs': '2px',
    '--inv-space-xs': '4px',
    '--inv-space-sm': '8px',
    '--inv-space-md': '12px',
    '--inv-space-lg': '20px',
    '--inv-space-xl': '32px',
    '--inv-space-2xl': '44px',
  },
  standard: {
    '--inv-space-2xs': '3px',
    '--inv-space-xs': '6px',
    '--inv-space-sm': '12px',
    '--inv-space-md': '18px',
    '--inv-space-lg': '28px',
    '--inv-space-xl': '44px',
    '--inv-space-2xl': '64px',
  },
  comfortable: {
    '--inv-space-2xs': '4px',
    '--inv-space-xs': '8px',
    '--inv-space-sm': '16px',
    '--inv-space-md': '24px',
    '--inv-space-lg': '36px',
    '--inv-space-xl': '56px',
    '--inv-space-2xl': '88px',
  },
}

// Layout geometry. Driven by spec.framing — a distinct axis from density: it
// governs the SIZE of major structural elements (sidebar, cards, hero), not the
// inter-element rhythm. spacious widens cards and grows the hero; compact pulls
// them in. card-aspect shifts to the taller 3/4 only at spacious so wide layouts
// read as posters, not thumbnails.
const FRAMING_TABLE: Record<NonNullable<StyleSpec['framing']>, Record<string, string>> = {
  compact: {
    '--inv-sidebar-w': '200px',
    '--inv-card-w': '132px',
    '--inv-card-w-wide': '248px',
    '--inv-card-aspect': '2 / 3',
    '--inv-hero-min-h': '320px',
    '--inv-section-gap': '28px',
  },
  standard: {
    '--inv-sidebar-w': '230px',
    '--inv-card-w': '168px',
    '--inv-card-w-wide': '320px',
    '--inv-card-aspect': '2 / 3',
    '--inv-hero-min-h': '420px',
    '--inv-section-gap': '44px',
  },
  spacious: {
    '--inv-sidebar-w': '264px',
    '--inv-card-w': '196px',
    '--inv-card-w-wide': '384px',
    '--inv-card-aspect': '3 / 4',
    '--inv-hero-min-h': '520px',
    '--inv-section-gap': '64px',
  },
}

export function nonColorTokens(
  spec: Pick<StyleSpec, 'radius' | 'shadow' | 'density' | 'borderWeight' | 'mode' | 'typography' | 'framing'>,
): Record<string, string> {
  const [radiusBase, radiusLg] = RADIUS_TABLE[spec.radius]
  const [shadow1, shadow2] = SHADOW_TABLE[spec.shadow][spec.mode]
  // typography/framing are optional on the raw interface (zod defaults them on
  // parse via compileTheme, but direct unit-test callers may pass raw specs).
  const typo = spec.typography ?? 'standard'
  const fram = spec.framing ?? 'standard'
  const display = TYPOGRAPHY_TABLE[typo]
  return {
    '--inv-radius-base': radiusBase,
    '--inv-radius-lg': radiusLg,
    '--inv-shadow-1': shadow1,
    '--inv-shadow-2': shadow2,
    '--inv-density-unit': DENSITY_TABLE[spec.density],
    '--inv-border-width': BORDER_WIDTH_TABLE[spec.borderWeight],
    '--inv-display-transform': display.transform,
    '--inv-display-tracking': display.tracking,
    '--inv-display-weight': display.weight,
    ...SPACE_SCALE[spec.density],
    ...FRAMING_TABLE[fram],
  }
}
