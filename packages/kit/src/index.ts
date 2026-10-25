// @invariance/kit — Tailwind-coupled component recipes whose anatomy is picked
// by the active Invariance theme's `variants` (via useVariant). Requires the
// kit Tailwind preset (`@invariance/kit/tailwind-preset`).
export { Button } from './button'
export type { ButtonProps } from './button'
export { MediaCard } from './media-card'
export type { MediaCardProps } from './media-card'
export { SectionHeader } from './section-header'
export type { SectionHeaderProps } from './section-header'
export { Reveal, MOTION_PRESETS } from './reveal'
export type { RevealProps } from './reveal'
export { Marquee } from './marquee'
export type { MarqueeProps } from './marquee'
export { buttonRecipe, cardRecipe, sectionHeaderRecipe, CARD_CAPTION_PLACEMENT } from './recipes'
export * from './variants'
