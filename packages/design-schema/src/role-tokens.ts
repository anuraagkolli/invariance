export const ROLE_TOKENS = [
  '--inv-surface-0', '--inv-surface-1', '--inv-surface-2',
  '--inv-text-primary', '--inv-text-secondary', '--inv-text-disabled',
  '--inv-accent', '--inv-accent-hover', '--inv-accent-contrast', '--inv-accent-subtle',
  '--inv-border', '--inv-border-strong', '--inv-ring',
  '--inv-font-display', '--inv-font-body', '--inv-font-mono',
  '--inv-radius-base', '--inv-radius-lg', '--inv-shadow-1', '--inv-shadow-2',
  '--inv-density-unit', '--inv-border-width',
  // Display typography (transform/tracking/weight) — derived from StyleSpec.typography.
  '--inv-display-transform', '--inv-display-tracking', '--inv-display-weight',
  // Space scale — derived from StyleSpec.density (one ramp, seven steps).
  '--inv-space-2xs', '--inv-space-xs', '--inv-space-sm', '--inv-space-md',
  '--inv-space-lg', '--inv-space-xl', '--inv-space-2xl',
  // Layout geometry — derived from StyleSpec.framing.
  '--inv-sidebar-w', '--inv-card-w', '--inv-card-w-wide', '--inv-card-aspect',
  '--inv-hero-min-h', '--inv-section-gap',
] as const

export type RoleToken = (typeof ROLE_TOKENS)[number]

// Strict subset of ROLE_TOKENS: only the 13 hex-valued color tokens
export const COLOR_ROLE_TOKENS = [
  '--inv-surface-0', '--inv-surface-1', '--inv-surface-2',
  '--inv-text-primary', '--inv-text-secondary', '--inv-text-disabled',
  '--inv-accent', '--inv-accent-hover', '--inv-accent-contrast', '--inv-accent-subtle',
  '--inv-border', '--inv-border-strong', '--inv-ring',
] as const
