'use client'

import type { ReactNode } from 'react'
import {
  InvarianceProvider,
  CustomizationPanel,
} from 'invariance'

import { CarouselRow, GridRow } from '../components/title-row'
import { invarianceConfig as config, llmProviderProps } from '../lib/invariance-config'

// The F4 swap path looks components up here by name; both render a row of
// title cards (Carousel = scroll-snap strip, Grid = wrapped grid).
const componentLibrary = { CarouselRow, GridRow }

export function Providers({ children }: { children: ReactNode }) {
  // Provider/baseUrl/model/key come from NEXT_PUBLIC_* env (see invariance-config).
  // Spread so the default (Anthropic) path stays exactly { apiKey } — no new props.
  const llm = llmProviderProps()
  return (
    <InvarianceProvider
      config={config}
      userId="demo-user"
      storage="localStorage"
      componentLibrary={componentLibrary}
      {...llm}
    >
      {children}
      <CustomizationPanel />
    </InvarianceProvider>
  )
}
