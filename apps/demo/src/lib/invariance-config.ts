import type { InvarianceConfig } from 'invariance'

// Relational constraints only — no palette mode. The compiler guarantees AA at
// every level, so the config just floors contrast and caps accent chroma.
// Exported for use by Providers and the gauntlet page.
export const invarianceConfig: InvarianceConfig = {
  app: 'nebula-demo',
  frontend: {
    design: {
      constraints: {
        contrast: '>= 4.5',
        accent_chroma_max: 0.25,
        font_registry: 'default',
        allowed_modes: ['light', 'dark'],
      },
    },
    pages: { '/': { level: 4 } },
  },
}
