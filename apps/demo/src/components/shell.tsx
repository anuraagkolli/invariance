'use client'

import type { ReactNode } from 'react'
import { m } from 'invariance'

import { Sidebar } from './sidebar'
import { Header } from './header'
import { Footer } from './footer'

interface ShellProps {
  // The m.page name for this route ('home', 'series', …). Drives the page
  // wrapper so per-page text/layout overrides resolve against the right page.
  pageName: string
  children: ReactNode
}

// The Nebula app chrome — sidebar + header + footer — shared by every route so
// a second surface (/series) gets the same navigation and the same themeable
// slots without duplicating the composition. Page-specific content (hero, rows)
// is passed as children and rendered inside <main>.
export function Shell({ pageName, children }: ShellProps) {
  return (
    <m.page name={pageName}>
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
            {children}

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
