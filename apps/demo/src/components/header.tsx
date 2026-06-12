'use client'

import { useSearch } from './search-context'

// Sticky top bar: a search input and an avatar. Uses header slot tokens so a
// theme can repaint the bar independently of the page surface. The search input
// is wired to the search context so typing/focusing opens the results overlay.
export function Header() {
  const { query, setQuery, openSearch, inputRef } = useSearch()

  return (
    <header
      className="sticky top-0 z-40 flex items-center gap-4 border-b bg-[var(--inv-header-bg)]/85 px-5 py-3 text-[var(--inv-header-text)] backdrop-blur-md sm:px-8"
      style={{ borderColor: 'var(--inv-border)' }}
    >
      <span className="font-display text-lg font-bold uppercase tracking-[0.3em] text-[var(--inv-header-text)] lg:hidden">
        Nebula
      </span>

      <div className="relative ml-auto w-full max-w-sm">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary">
          ⌕
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={openSearch}
          placeholder="Search titles, genres, people"
          aria-label="Search"
          className="w-full rounded-base border bg-surface1 py-2 pl-9 pr-3 text-sm text-textPrimary placeholder:text-textDisabled focus:outline-none focus:ring-2 focus:ring-ring"
          style={{ borderColor: 'var(--inv-border)' }}
        />
      </div>

      <button
        type="button"
        aria-label="Notifications"
        className="hidden h-9 w-9 items-center justify-center rounded-base text-textSecondary transition-colors hover:bg-surface2 hover:text-textPrimary sm:flex"
      >
        ◔
      </button>

      <button
        type="button"
        aria-label="Account"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent font-display text-sm font-bold text-accentContrast"
      >
        R
      </button>
    </header>
  )
}
