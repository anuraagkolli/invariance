'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { useSearch } from './search-context'

// Nav items that route, plus the Search item which opens the overlay instead of
// navigating (href '#' + onClick). `match` is the pathname an item is active on.
const NAV_PRIMARY = [
  { label: 'Home', icon: '◇', href: '/', match: '/' },
  { label: 'Search', icon: '⌕', action: 'search' as const },
  { label: 'My List', icon: '+', href: '#' },
  { label: 'Movies', icon: '▦', href: '#' },
  { label: 'Series', icon: '☰', href: '/series', match: '/series' },
]

const LIBRARY = ['Late Night Sci-Fi', 'Cozy Mysteries', 'Weekend Epics', 'Rewatch Forever']

// Consumes the sidebar slot tokens via arbitrary-value utilities so a whole-app
// theme that rewrites --inv-sidebar-* repaints the nav coherently.
export function Sidebar() {
  const pathname = usePathname()
  const { focusInput } = useSearch()

  const itemClass = (active: boolean) =>
    `flex items-center gap-3 rounded-base px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? 'bg-accentSubtle text-textPrimary'
        : 'text-textSecondary hover:bg-surface2 hover:text-textPrimary'
    }`

  return (
    <aside
      className="fixed inset-y-0 left-0 z-20 hidden w-[230px] flex-col border-r bg-[var(--inv-sidebar-bg)] text-[var(--inv-sidebar-text)] lg:flex"
      style={{ borderColor: 'var(--inv-sidebar-border)' }}
    >
      <div className="px-6 pb-8 pt-7">
        <Link
          href="/"
          className="font-display text-2xl font-bold uppercase tracking-[0.32em] text-[var(--inv-sidebar-text)]"
        >
          Nebula
        </Link>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV_PRIMARY.map((item) => {
          // Search opens the overlay rather than routing.
          if (item.action === 'search') {
            return (
              <button
                key={item.label}
                type="button"
                onClick={focusInput}
                className={`${itemClass(false)} text-left`}
              >
                <span className="w-4 text-center text-base text-accent">{item.icon}</span>
                {item.label}
              </button>
            )
          }
          const active = item.match !== undefined && pathname === item.match
          return (
            <Link
              key={item.label}
              href={item.href ?? '#'}
              aria-current={active ? 'page' : undefined}
              className={itemClass(active)}
            >
              <span className="w-4 text-center text-base text-accent">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-8 px-6">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-textDisabled">
          My Library
        </h2>
      </div>
      <nav className="mt-2 flex flex-col gap-0.5 px-3">
        {LIBRARY.map((name) => (
          <a
            key={name}
            href="#"
            className="flex items-center gap-3 rounded-base px-3 py-1.5 text-sm text-textSecondary transition-colors hover:bg-surface2 hover:text-textPrimary"
          >
            <span className="h-2 w-2 shrink-0 rounded-[2px] bg-border" />
            <span className="truncate">{name}</span>
          </a>
        ))}
      </nav>

      <div
        className="mt-auto flex flex-col gap-1 border-t px-3 py-4"
        style={{ borderColor: 'var(--inv-sidebar-border)' }}
      >
        <a
          href="#"
          className="flex items-center gap-3 rounded-base px-3 py-2 text-sm text-textSecondary transition-colors hover:bg-surface2 hover:text-textPrimary"
        >
          <span className="w-4 text-center text-accent">⚙</span>
          Settings
        </a>
        <a
          href="#"
          className="flex items-center gap-3 rounded-base px-3 py-2 text-sm font-medium text-textPrimary transition-colors hover:bg-surface2"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent font-display text-xs font-bold text-accentContrast">
            R
          </span>
          Rae Kelso
        </a>
      </div>
    </aside>
  )
}
