'use client'

import { m } from '@invariance/design'
import { Button } from '@invariance/kit'

import { PageIntro } from './page-intro'
import { Shell } from './shell'
import { GridRow } from './title-row'
import { TITLES } from '../lib/titles'

// A fixed spread of the catalog standing in for the user's saved titles.
const SAVED = TITLES.filter((_, i) => i % 4 === 0)

// The /my-list surface. The config locks this page (level 0): app-wide looks
// still reach its cards and buttons, but nothing can target this page alone.
export function MyListScreen() {
  return (
    <Shell pageName="my-list">
      <PageIntro
        id="my-list"
        kicker="Your Library"
        title="My List"
        subtitle="Everything you saved for later."
      >
        <div className="mt-3 flex flex-wrap gap-sm">
          <Button tone="primary">Play All</Button>
          <Button tone="secondary">Clear List</Button>
        </div>
      </PageIntro>

      <div className="flex flex-col gap-section px-2xl py-xl">
        <m.slot name="my-list-saved" level={1} description="Saved titles grid">
          <GridRow titles={SAVED} heading="Saved Titles" index={0} />
        </m.slot>
      </div>
    </Shell>
  )
}
