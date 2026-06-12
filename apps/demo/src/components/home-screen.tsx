'use client'

import { m } from 'invariance'

import { Sidebar } from './sidebar'
import { Header } from './header'
import { Hero } from './hero'
import { Footer } from './footer'
import { CarouselRow } from './title-row'
import { ROWS, HERO_TITLE, type TitleRow } from '../lib/titles'

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
        <h2 className="font-display text-lg font-semibold tracking-tight text-textPrimary sm:text-xl">
          <m.text name={`heading-${row.id}`}>{row.heading}</m.text>
        </h2>
        <CarouselRow titles={row.titles} shape={shape} />
      </section>
    </m.slot>
  )
}

// The full home-page composition: sidebar + header + hero + carousels + footer.
// Used by both the main page and the gauntlet, which wraps it in a theme-
// applying effect to preview packs without touching any stored theme.
export function HomeScreen() {
  return (
    <m.page name="home">
      <div className="min-h-screen bg-surface0">
        <m.slot
          name="sidebar"
          level={1}
          cssVariables={['--inv-sidebar-bg', '--inv-sidebar-text', '--inv-sidebar-border']}
          description="Left vertical navigation"
          aliases={['nav', 'left nav', 'navigation']}
        >
          <Sidebar />
        </m.slot>

        <div className="lg:pl-[230px]">
          <m.slot
            name="header"
            level={1}
            cssVariables={['--inv-header-bg', '--inv-header-text']}
            description="Sticky top bar with search and avatar"
            aliases={['top bar', 'search bar']}
          >
            <Header />
          </m.slot>

          <main className="flex flex-col">
            <m.slot
              name="hero"
              level={3}
              cssVariables={['--inv-hero-text']}
              description="Featured title billboard"
              aliases={['billboard', 'banner', 'featured']}
            >
              <Hero title={HERO_TITLE} />
            </m.slot>

            <div
              className="flex flex-col px-6 py-10 sm:px-10"
              style={{ gap: 'calc(var(--inv-density-unit) * 11)' }}
            >
              {/* Only the carousel rows are reorderable (F3). Hero/header/
                  sidebar/footer stay outside m.sections — not reorderable. */}
              <m.sections>
                {ROWS.map((row) => (
                  <Row key={row.id} name={row.slot} row={row} />
                ))}
              </m.sections>
            </div>

            <m.slot
              name="footer"
              level={1}
              cssVariables={['--inv-footer-bg', '--inv-footer-text']}
              description="Page footer with link columns"
              aliases={['bottom', 'site footer']}
            >
              <Footer />
            </m.slot>
          </main>
        </div>
      </div>
    </m.page>
  )
}
