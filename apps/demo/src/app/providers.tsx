'use client'

import type { ReactNode } from 'react'
import {
  InvarianceProvider,
  CustomizationPanel,
  type InvarianceConfig,
} from 'invariance'

import { CarouselRow, GridRow } from '../components/title-row'

// Relational constraints only — no palette mode. The compiler guarantees AA at
// every level, so the config just floors contrast and caps accent chroma.
const config: InvarianceConfig = {
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

// The F4 swap path looks components up here by name; both render a row of
// title cards (Carousel = scroll-snap strip, Grid = wrapped grid).
const componentLibrary = { CarouselRow, GridRow }

export function Providers({ children }: { children: ReactNode }) {
  return (
    <InvarianceProvider
      config={config}
      apiKey={process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? ''}
      userId="demo-user"
      storage="localStorage"
      componentLibrary={componentLibrary}
    >
      {children}
      <CustomizationPanel />
    </InvarianceProvider>
  )
}
