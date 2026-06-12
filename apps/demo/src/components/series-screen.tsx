'use client'

import { m } from 'invariance'

import { Shell } from './shell'
import { CarouselRow } from './title-row'
import { GENRES, titlesByGenre, type Title } from '../lib/titles'

// Minimum titles for a genre to earn its own row, so no /series row reads thin.
const MIN_ROW = 3
// Cap so the page is a focused handful of rows, not every genre in the catalog.
const MAX_ROWS = 5

interface GenreRow {
  genre: string
  // Stable slot name the layout/F4 maps key on (e.g. 'series-row-sci-fi').
  slot: string
  titles: Title[]
}

// Build genre rows from the catalog: full-enough genres in first-appearance
// order, capped at MAX_ROWS. Pure derivation so the rows track the title data.
const SERIES_ROWS: GenreRow[] = GENRES.map((genre) => ({
  genre,
  slot: `series-row-${genre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  titles: titlesByGenre(genre),
}))
  .filter((r) => r.titles.length >= MIN_ROW)
  .slice(0, MAX_ROWS)

// One genre row: an m.slot (level 4 → F4 swap target) wrapping a heading m.text
// and a CarouselRow, mirroring the home Row pattern so F3 reorder/hide and F4
// swap work identically on this surface.
function SeriesRow({ row }: { row: GenreRow }) {
  return (
    <m.slot
      name={row.slot}
      level={4}
      description={`${row.genre} series carousel`}
      aliases={[row.genre.toLowerCase(), `${row.genre.toLowerCase()} row`]}
      // Forward titles so the F4-swapped library component (e.g. GridRow) gets data.
      props={{ titles: row.titles, shape: 'standard' }}
    >
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight text-textPrimary sm:text-xl">
          <m.text name={`series-heading-${row.slot}`}>{row.genre}</m.text>
        </h2>
        <CarouselRow titles={row.titles} shape="standard" />
      </section>
    </m.slot>
  )
}

// The /series surface: a themed page title plus genre-grouped carousels, all in
// the shared Shell chrome so it gets the same nav/header/footer and themeable
// slots as home. Exercises per-page content/layout keying under '/series'.
export function SeriesScreen() {
  return (
    <Shell pageName="series">
      <div className="flex flex-col gap-2 px-6 pt-12 sm:px-10">
        <span className="font-mono text-xs uppercase tracking-[0.34em] text-accent">
          Browse Series
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight text-textPrimary sm:text-4xl">
          <m.text name="series-page-title">Series by Genre</m.text>
        </h1>
        <p className="max-w-xl text-sm text-textSecondary">
          <m.text name="series-page-subtitle">
            Every Nebula series, sorted into the worlds they belong to.
          </m.text>
        </p>
      </div>

      <div
        className="flex flex-col px-6 py-10 sm:px-10"
        style={{ gap: 'calc(var(--inv-density-unit) * 11)' }}
      >
        {/* Same reorderable-sections pattern as home: each child keyed by its
            m.slot name so F3 ordering/hiding applies on /series too. */}
        <m.sections>
          {SERIES_ROWS.map((row) => (
            <SeriesRow key={row.slot} row={row} />
          ))}
        </m.sections>
      </div>
    </Shell>
  )
}
