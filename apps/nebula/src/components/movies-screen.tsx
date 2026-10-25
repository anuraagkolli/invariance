'use client'

import { m } from '@invariance/design'
import { Button } from '@invariance/kit'

import { PageIntro } from './page-intro'
import { Shell } from './shell'
import { CarouselRow, GridRow } from './title-row'
import { TITLES, type Title } from '../lib/titles'

interface MovieRow {
  slot: string
  heading: string
  description: string
  aliases: string[]
  titles: Title[]
  grid?: boolean
}

// Runtime/year cuts of the catalog, so /movies has its own targetable sections
// ("make the epics polaroid") distinct from the home and series rows.
export const MOVIE_ROWS: MovieRow[] = [
  {
    slot: 'movies-row-epics',
    heading: 'Epic Runtimes',
    description: 'Feature-length movies over two hours',
    aliases: ['epics', 'long movies', 'epic row'],
    titles: TITLES.filter((t) => t.durationMin >= 120),
  },
  {
    slot: 'movies-row-quick',
    heading: 'Quick Watches',
    description: 'Movies under an hour and three quarters',
    aliases: ['quick watches', 'short movies', 'quick row'],
    titles: TITLES.filter((t) => t.durationMin < 105),
  },
  {
    slot: 'movies-row-new',
    heading: 'New This Year',
    description: 'Grid of the newest releases',
    aliases: ['new movies', 'new releases', 'newest'],
    titles: TITLES.filter((t) => t.year >= 2024).slice(0, 12),
    grid: true,
  },
]

function MoviesRow({ row, index }: { row: MovieRow; index: number }) {
  const rowProps = { titles: row.titles, shape: 'standard' as const, heading: row.heading, headingName: `${row.slot}-heading`, index }
  const Row = row.grid ? GridRow : CarouselRow
  return (
    <m.slot name={row.slot} level={4} description={row.description} aliases={row.aliases} props={rowProps}>
      <Row {...rowProps} />
    </m.slot>
  )
}

// The /movies surface: an action bar of kit Buttons (its own slot, so button
// looks can be targeted here alone) above three runtime/year rows.
export function MoviesScreen() {
  return (
    <Shell pageName="movies">
      <PageIntro
        id="movies"
        kicker="Browse Movies"
        title="Tonight's Movies"
        subtitle="Pick a runtime that fits the evening."
      >
        <m.slot name="movies-actions" level={2} description="Movie page action buttons" aliases={['movie buttons', 'actions']}>
          <div className="mt-3 flex flex-wrap gap-sm">
            <Button tone="primary">Surprise Me</Button>
            <Button tone="secondary">Sort by Runtime</Button>
          </div>
        </m.slot>
      </PageIntro>

      <div className="flex flex-col gap-section px-2xl py-xl">
        <m.sections>
          {MOVIE_ROWS.map((row, i) => (
            <MoviesRow key={row.slot} row={row} index={i} />
          ))}
        </m.sections>
      </div>
    </Shell>
  )
}
