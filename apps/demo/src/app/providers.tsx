'use client'

import type { ReactNode } from 'react'
import {
  InvarianceProvider,
  CustomizationPanel,
} from 'invariance'

import { CarouselRow, GridRow } from '../components/title-row'
import { invarianceConfig as config } from '../lib/invariance-config'

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
