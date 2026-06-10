'use client'

import { m } from "invariance";
import { Sidebar } from '@/components/Sidebar'
import { Dashboard } from '@/components/Dashboard'
import { NAV_ITEMS, MOCK_USER, METRICS, CHART_DATA, FOOTER_LINKS } from '@/lib/mock-data'

// The app bar and footer are inlined here (rather than extracted into their own
// components) so the page root holds multiple styled sibling sections in a
// single file — the shape the scanner must attribute correctly (header's colors
// must not leak into the footer and vice versa).
export default function Page() {
  const year = new Date().getFullYear()
  const notificationCount = 3

  return (
    <m.page name="home"><div className="flex flex-col h-full">
            {/* App bar */}
            <m.slot name="section-1" level={0} preserve={true} cssVariables={['--inv-section-1-bg', '--inv-section-1-border', '--inv-section-1-text', '--inv-section-1-text-1', '--inv-section-1-text-2', '--inv-section-1-bg-1', '--inv-section-1-bg-2', '--inv-section-1-pad', '--inv-section-1-pad-1', '--inv-section-1-pad-2', '--inv-section-1-radius', '--inv-section-1-pad-3']}><header className="flex items-center gap-[var(--inv-section-1-pad)] px-[var(--inv-section-1-pad-1)] py-[var(--inv-section-1-pad)] bg-[var(--inv-section-1-bg)] border-b border-[var(--inv-section-1-border)] shrink-0">
                        <h1 className="text-lg font-semibold text-[var(--inv-section-1-text)]"><m.text name="text-1">Dashboard</m.text></h1>

                        <div className="relative ml-auto">
                          <svg
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--inv-section-1-text-1)]"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          <input
                            type="search"
                            placeholder="Search..."
                            className="pl-[var(--inv-section-1-pad-3)] pr-[var(--inv-section-1-pad)] py-[var(--inv-section-1-pad-2)] text-sm bg-[var(--inv-section-1-bg-1)] rounded-[var(--inv-section-1-radius)] border border-[var(--inv-section-1-border)] focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors w-56"
                            aria-label="Search"
                          />
                        </div>

                        <button
                          type="button"
                          className="relative p-[var(--inv-section-1-pad-2)] rounded-[var(--inv-section-1-radius)] text-[var(--inv-section-1-text-2)] hover:bg-gray-100 hover:text-gray-700 transition-colors"
                          aria-label={`Notifications (${notificationCount} unread)`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-5 h-5"
                          >
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                          </svg>
                          {notificationCount > 0 && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--inv-section-1-bg-2)] rounded-full" aria-hidden="true" />
                          )}
                        </button>
                      </header></m.slot>

            {/* Body: sidebar + main content */}
            <m.slot name="section-2" level={0}><div className="flex flex-1 min-h-0">
                        <Sidebar navigationItems={NAV_ITEMS} user={MOCK_USER} />
                        <Dashboard metrics={METRICS} chartData={CHART_DATA} />
                      </div></m.slot>

            {/* Footer */}
            <m.slot name="section-3" level={0} cssVariables={['--inv-section-3-bg', '--inv-section-3-border', '--inv-section-3-text', '--inv-section-3-pad', '--inv-section-3-pad-1']}><footer className="flex flex-wrap items-center justify-between gap-[var(--inv-section-3-pad)] px-[var(--inv-section-3-pad-1)] py-[var(--inv-section-3-pad)] bg-[var(--inv-section-3-bg)] border-t border-[var(--inv-section-3-border)] shrink-0">
                        <p className="text-sm text-[var(--inv-section-3-text)]">
                          {`© ${year} Acme Inc. All rights reserved.`}
                        </p>
                        <nav aria-label="Footer links">
                          <ul className="flex items-center gap-[var(--inv-section-3-pad)]">
                            {FOOTER_LINKS.map((link) => (
                              <li key={link.href}>
                                <a
                                  href={link.href}
                                  className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
                                >
                                  {link.label}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </nav>
                      </footer></m.slot>
          </div></m.page>
  )
}
