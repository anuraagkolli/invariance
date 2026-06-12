'use client'

import { useEffect } from 'react'
import { m } from 'invariance'

import { searchTitles } from '../lib/titles'
import { TitleCard } from './title-card'
import { useSearch } from './search-context'

// A few seeded chips for the empty state so a viewer has somewhere to start —
// each is a genre/keyword that actually returns results from searchTitles.
const TRENDING_SEARCHES = ['Sci-Fi', 'Horror', 'Fantasy', 'Crimson', 'Lantern', 'Documentary']

// Renders ONCE at the app root (mounted in providers.tsx, below the header so it
// overlays the page). Instant-filters TITLES as the user types in the header.
export function SearchOverlay() {
  const { query, setQuery, open, closeSearch } = useSearch()

  // Esc closes the overlay (and clears the query) while it's open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeSearch])

  if (!open) return null

  const q = query.trim()
  const results = searchTitles(q)
  const heading = q ? `Results for “${q}”` : 'Search'

  return (
    // Below the sticky header (top-[57px]) so the input stays visible and live.
    // Covers the page with the solid surface-0 token. WHY solid (not /95): the
    // `bg-token/alpha` modifier compiles to rgb(var(--inv-…) / a), but our role
    // tokens hold hex strings (not r g b channels), so the alpha form silently
    // resolves transparent — the same gotcha the hsl() gradients avoid. A solid
    // token surface keeps it theme-driven AND actually opaque so results read.
    <div
      className="fixed inset-x-0 bottom-0 top-[57px] z-30 overflow-y-auto bg-surface0 lg:left-[230px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeSearch()
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-textPrimary">
            <m.text name="search-heading">{heading}</m.text>
          </h2>
          {q && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-textSecondary">
              {results.length} {results.length === 1 ? 'title' : 'titles'}
            </span>
          )}
        </div>

        {!q && (
          <div className="mt-6 flex flex-col gap-3">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-textDisabled">
              Trending searches
            </span>
            <div className="flex flex-wrap gap-2">
              {TRENDING_SEARCHES.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQuery(term)}
                  className="rounded-base border bg-surface1 px-3 py-1.5 text-sm text-textSecondary transition-colors hover:bg-surface2 hover:text-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ borderColor: 'var(--inv-border)' }}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}

        {q && results.length === 0 && (
          <p className="mt-8 text-sm text-textSecondary">
            No titles match “{q}”. Try a genre like Sci-Fi, Drama, or Horror.
          </p>
        )}

        {results.length > 0 && (
          <div
            className="mt-8 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6"
            style={{ gap: 'calc(var(--inv-density-unit) * 3)' }}
          >
            {results.map((title) => (
              <TitleCard key={title.id} title={title} shape="standard" />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
