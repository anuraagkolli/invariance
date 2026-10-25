// Variant vocabularies the kit ships recipes for. React-free so server code
// (config modules, verifiers) can import it.
//
// Axis names are the keys a theme writes under `variants` (theme.json v2) and an
// app declares under `frontend.variants`.

export const BUTTON_LOOKS = ['solid', 'outline', 'ghost', 'brutal', 'pill', 'glow'] as const
export type ButtonLook = (typeof BUTTON_LOOKS)[number]

export const CARD_LOOKS = ['poster', 'caption', 'polaroid', 'framed', 'tilt', 'glass'] as const
export type CardLook = (typeof CARD_LOOKS)[number]

export const SECTION_HEADER_LOOKS = ['plain', 'rule', 'numbered', 'label', 'outline'] as const
export type SectionHeaderLook = (typeof SECTION_HEADER_LOOKS)[number]

export const MOTION_LOOKS = ['none', 'subtle', 'springy', 'snappy', 'playful'] as const
export type MotionLook = (typeof MOTION_LOOKS)[number]

export const KIT_AXES = {
  button: { options: BUTTON_LOOKS, default: 'solid' },
  card: { options: CARD_LOOKS, default: 'poster' },
  'section-header': { options: SECTION_HEADER_LOOKS, default: 'plain' },
  motion: { options: MOTION_LOOKS, default: 'subtle' },
} as const

export type KitAxis = keyof typeof KIT_AXES

// Config fragment for `frontend.variants`: every kit axis with all its looks
// allowed. Pass `only` to narrow an axis (the developer's look-invariant).
export function kitVariantAxes(
  only: { [A in KitAxis]?: ReadonlyArray<(typeof KIT_AXES)[A]['options'][number]> } = {},
): Record<KitAxis, { options: string[]; default: string }> {
  const out = {} as Record<KitAxis, { options: string[]; default: string }>
  for (const axis of Object.keys(KIT_AXES) as KitAxis[]) {
    const all: readonly string[] = KIT_AXES[axis].options
    const allowed = only[axis] ? all.filter((o) => (only[axis] as readonly string[]).includes(o)) : [...all]
    const def: string = KIT_AXES[axis].default
    out[axis] = { options: allowed, default: allowed.includes(def) ? def : (allowed[0] ?? def) }
  }
  return out
}
