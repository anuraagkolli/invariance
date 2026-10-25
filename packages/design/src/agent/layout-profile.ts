import type { StyleSpec } from '../compiler/style-spec'
import type { InvarianceConfig, LayoutSection, ComponentsSection, ThemeJsonV2, VariantsSection } from '../config/types'

// Deterministic structural profile for a theme. A "theme" is a StyleSpec, which
// has no layout dimension — but its shape axes signal how blocky the look is.
// A hard-edged, tight look (retro/arcade/brutalist/terminal: sharp corners, not
// spacious, not comfortable) lays sections out as a grid; soft or roomy looks
// (editorial, pastel, glass) keep the app's default (e.g. carousels). Keyed on
// axes the Designer reliably sets — for "make it retro" qwen leaves `framing`
// 'standard' but sets radius:'sharp' + density:'compact', so radius is the
// load-bearing signal, with framing/density as the elegant-look exclusions.
// Apps map these profile names to concrete layout/components presets via
// `frontend.layout_profiles`, so app-specific slot/component names stay in the
// app, not this generic package.
export function galleryProfile(spec: StyleSpec | undefined): 'grid' | 'standard' {
  if (!spec) return 'standard'
  const blocky =
    spec.radius === 'sharp' && spec.framing !== 'spacious' && spec.density !== 'comfortable'
  return blocky ? 'grid' : 'standard'
}

// Richer structural archetype for a theme, used to pick a whole-page preset
// (layout + component swaps + component variants). Deterministic over the
// StyleSpec axes the Designer reliably sets, first match wins. The ten shipped
// packs spread across all seven profiles.
export const THEME_PROFILES = ['brutal', 'terminal', 'editorial', 'glass', 'cinematic', 'soft', 'standard'] as const
export type ThemeProfile = (typeof THEME_PROFILES)[number]

export function themeProfile(spec: StyleSpec | undefined): ThemeProfile {
  if (!spec) return 'standard'
  const round = spec.radius === 'rounded' || spec.radius === 'pill'
  const hardEdged = spec.radius === 'sharp' || spec.radius === 'subtle'
  if (spec.shadow === 'hard-offset' || (spec.radius === 'sharp' && spec.borderWeight === 'heavy')) return 'brutal'
  if (spec.typography === 'technical' && spec.radius === 'sharp') return 'terminal'
  if (spec.typography === 'editorial' && hardEdged) return 'editorial'
  if (spec.mode === 'dark' && round && spec.shadow === 'pronounced') return 'glass'
  if (spec.typography === 'display-caps' && spec.shadow === 'pronounced') return 'cinematic'
  if (round) return 'soft'
  return 'standard'
}

type LayoutPreset = { layout?: LayoutSection; components?: ComponentsSection; variants?: VariantsSection }

// The app preset for a spec: the rich profile first, then the legacy gallery
// profile ('grid'), so apps that only declared `grid` keep working unchanged.
export function presetFor(spec: StyleSpec | undefined, config: InvarianceConfig): LayoutPreset | undefined {
  const profiles = config.frontend?.layout_profiles as Record<string, LayoutPreset> | undefined
  if (!profiles) return undefined
  return profiles[themeProfile(spec)] ?? profiles[galleryProfile(spec)]
}

// Merge two page-keyed sections (layout or components): `over`'s pages win,
// pages only in `base` are kept. Returns undefined when neither is present — so
// it also serves as the plain carry-forward when there is no preset.
export function mergeSectionPages<T extends { pages: Record<string, unknown> }>(
  base: T | undefined,
  over: T | undefined,
): T | undefined {
  if (!base && !over) return undefined
  return { ...(over ?? base), pages: { ...(base?.pages ?? {}), ...(over?.pages ?? {}) } } as T
}

// Write the layout/components for `spec`'s profile onto `candidate`, merged over
// the user's current structure (preset pages win; untouched pages preserved).
// With no matching profile/preset this is just the carry-forward of `current`.
export function applyLayoutPreset(
  candidate: ThemeJsonV2,
  current: ThemeJsonV2,
  spec: StyleSpec | undefined,
  config: InvarianceConfig,
): void {
  const preset = presetFor(spec, config)
  const layout = mergeSectionPages(current.layout, preset?.layout)
  const components = mergeSectionPages(current.components, preset?.components)
  if (layout) candidate.layout = layout
  if (components) candidate.components = components
  // A preset's variants are a whole look, so they REPLACE the previous theme's
  // (retro's brutal buttons must not leak into a pastel theme). No preset
  // variants = carry the user's current selection forward.
  const variants = preset?.variants ?? current.variants
  if (variants && Object.keys(variants).length > 0) candidate.variants = { ...variants }
}
