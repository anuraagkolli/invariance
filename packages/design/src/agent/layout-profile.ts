import type { StyleSpec } from '../compiler/style-spec'
import type { InvarianceConfig, LayoutSection, ComponentsSection, ThemeJsonV2 } from '../config/types'

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
  const preset = config.frontend?.layout_profiles?.[galleryProfile(spec)] as
    | { layout?: LayoutSection; components?: ComponentsSection }
    | undefined
  const layout = mergeSectionPages(current.layout, preset?.layout)
  const components = mergeSectionPages(current.components, preset?.components)
  if (layout) candidate.layout = layout
  if (components) candidate.components = components
}
