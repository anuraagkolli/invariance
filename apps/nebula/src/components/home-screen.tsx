'use client'

import { useEffect, useState } from 'react'
import { m } from '@invariance/design'

import { Shell } from './shell'
import { Hero } from './hero'
import { CarouselRow } from './title-row'
import { ROWS, HERO_TITLE, findTitle, type Title, type TitleRow } from '../lib/titles'

// The governed catalog projection the API serves (a subset of Title). We only
// read the fields the cards/modal show; everything else stays from the static
// Title. Kept local: catalog.ts is server-only (imports node:crypto).
interface GovernedShow {
  id: string
  title: string
  year: number
  genre: string
  maturity: Title['maturity']
  durationMin: number
  synopsis: string
  hue: number
}

// The demo's single end user — matches the InvarianceProvider userId so the
// home reads the same subject's governed view that the design plane themes.
const SUBJECT = 'demo-user'

// Re-key the curated rows through the governed catalog: keep curated order, but
// drop titles the governed view removed (a filter/hide hook) and overlay the
// governed field values (so the immutable title/maturity invariants — and any
// legal field change — show on the home, not just at the API seam).
function reconcileRows(rows: TitleRow[], shows: GovernedShow[]): TitleRow[] {
  const gov = new Map(shows.map((s) => [s.id, s]))
  return rows.map((row) => ({
    ...row,
    titles: row.titles.filter((t) => gov.has(t.id)).map((t) => ({ ...t, ...gov.get(t.id)! })),
  }))
}

// Nebula Originals get the wide 16:9 card treatment.
const shapeForRow = (rowId: string): 'standard' | 'wide' =>
  rowId === 'originals' ? 'wide' : 'standard'

// Aliases + descriptions help the Gatekeeper disambiguate natural-language
// slot references ("swap the trending row to a grid").
const ROW_META: Record<string, { description: string; aliases: string[] }> = {
  'row-trending': { description: 'Trending Now carousel of titles', aliases: ['trending', 'trending row', 'popular'] },
  'row-continue': { description: 'Continue Watching carousel with progress', aliases: ['continue', 'continue watching', 'resume'] },
  'row-originals': { description: 'Nebula Originals carousel of wide cards', aliases: ['originals', 'nebula originals'] },
  'row-new': { description: 'New Releases carousel of titles', aliases: ['new', 'new releases', 'recently added'] },
  'row-acclaimed': { description: 'Critically Acclaimed carousel of titles', aliases: ['acclaimed', 'critically acclaimed', 'top rated'] },
}

// m.sections keys each direct child by its `name` prop to apply F3
// ordering/hiding, so Row carries `name={row.slot}` — it must equal the slot
// name the layout references. The m.slot wrapper is Row's root element and the
// heading m.text rides inside it (the heading is part of the row, not a
// separately ordered section).
function Row({ name, row }: { name: string; row: TitleRow }) {
  const meta = ROW_META[row.slot]!
  const shape = shapeForRow(row.id)
  return (
    <m.slot
      name={name}
      level={4}
      description={meta.description}
      aliases={meta.aliases}
      // Forward titles + shape as slotProps so the F4 branch can pass them to
      // whatever library component is swapped in (e.g. GridRow). Without this,
      // the swapped component receives no data and renders an empty container.
      props={{ titles: row.titles, shape }}
    >
      <section className="flex flex-col gap-3">
        <h2
          className="font-display text-lg text-textPrimary sm:text-xl"
          style={{
            textTransform: 'var(--inv-display-transform)' as React.CSSProperties['textTransform'],
            letterSpacing: 'var(--inv-display-tracking)',
            fontWeight: 'var(--inv-display-weight)' as React.CSSProperties['fontWeight'],
          }}
        >
          <m.text name={`heading-${row.id}`}>{row.heading}</m.text>
        </h2>
        <CarouselRow titles={row.titles} shape={shape} />
      </section>
    </m.slot>
  )
}

// The full home-page composition: shell chrome + hero + reorderable carousels.
// Used by both the main page and the gauntlet, which wraps it in a theme-
// applying effect to preview packs without touching any stored theme.
export function HomeScreen() {
  // Static data is the instant first paint; the governed API then drives the
  // catalog so business-logic mods + invariants flow through to the home. Reads
  // are client-side and fail open — any error keeps the static catalog.
  const [rows, setRows] = useState<TitleRow[]>(ROWS)
  const [hero, setHero] = useState<Title>(HERO_TITLE)

  useEffect(() => {
    let active = true
    const headers = { 'x-demo-user': SUBJECT }
    void (async () => {
      try {
        const [showsRes, featRes] = await Promise.all([
          fetch('/api/shows', { headers }),
          fetch('/api/featured', { headers }),
        ])
        if (active && showsRes.ok) {
          const { shows } = (await showsRes.json()) as { shows?: GovernedShow[] }
          if (Array.isArray(shows)) setRows(reconcileRows(ROWS, shows))
        }
        if (active && featRes.ok) {
          const { show } = (await featRes.json()) as { show?: GovernedShow }
          if (show?.id) setHero({ ...(findTitle(show.id) ?? HERO_TITLE), ...show })
        }
      } catch {
        // fail open — keep the static catalog
      }
    })()
    return () => {
      active = false
    }
  }, [])

  return (
    <Shell pageName="home">
      <m.slot
        name="hero"
        level={3}
        cssVariables={['--inv-hero-text']}
        description="Featured title billboard"
        aliases={['billboard', 'banner', 'featured']}
      >
        <Hero title={hero} />
      </m.slot>

      <div className="flex flex-col gap-section px-2xl py-xl">
        {/* Only the carousel rows are reorderable (F3). Hero/header/sidebar/
            footer stay outside m.sections — not reorderable. */}
        <m.sections>
          {rows.map((row) => (
            <Row key={row.id} name={row.slot} row={row} />
          ))}
        </m.sections>
      </div>
    </Shell>
  )
}
