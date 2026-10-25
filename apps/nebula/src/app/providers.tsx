'use client'

import type { ReactNode } from 'react'
import {
  InvarianceProvider,
  CustomizationPanel,
} from '@invariance/design'

import { CarouselRow, GridRow, ListRow, SpotlightRow } from '../components/title-row'
import { TitleModalProvider } from '../components/title-modal-context'
import { TitleDetailModal } from '../components/title-detail-modal'
import { SearchProvider } from '../components/search-context'
import { SearchOverlay } from '../components/search-overlay'
import type { InvarianceConfig } from '@invariance/design'
import { llmProviderProps, themeStorageUrl } from '../lib/invariance-config'

// The F4 swap path looks components up here by name; all render a row of
// titles (Carousel = scroll-snap strip, Grid = wrapped grid, List = ranked
// index, Spotlight = lead feature + supporting grid).
const componentLibrary = { CarouselRow, GridRow, ListRow, SpotlightRow }

// config arrives from the server layout: the static base merged with the
// developer's lock/unlock overlay from the control-plane design-config, serialized across the boundary.
export function Providers({ config, children }: { config: InvarianceConfig; children: ReactNode }) {
  const llm = llmProviderProps()
  return (
    <InvarianceProvider
      config={config}
      userId="demo-user"
      storage="api"
      storageUrl={themeStorageUrl()}
      componentLibrary={componentLibrary}
      {...llm}
    >
      {/* Search + modal contexts live INSIDE InvarianceProvider so the modal's
          m.slot/m.text resolve theme context and the modal re-themes live. The
          single TitleDetailModal + SearchOverlay render once at the root. */}
      <SearchProvider>
        <TitleModalProvider>
          {children}
          <TitleDetailModal />
          <SearchOverlay />
        </TitleModalProvider>
      </SearchProvider>
      <CustomizationPanel />
    </InvarianceProvider>
  )
}
