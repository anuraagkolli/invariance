import { m } from "invariance";

interface HeaderProps {
  title: string
  notificationCount: number
}

export function Header({ title, notificationCount }: HeaderProps) {
  return (
    <m.slot name="section-4" level={0} cssVariables={['--inv-section-4-bg', '--inv-section-4-border', '--inv-section-4-text', '--inv-section-4-text-1', '--inv-section-4-text-2', '--inv-section-4-bg-1', '--inv-section-4-bg-2', '--inv-section-4-pad', '--inv-section-4-pad-1', '--inv-section-4-pad-2', '--inv-section-4-radius', '--inv-section-4-pad-3']}><header className="flex items-center gap-[var(--inv-section-4-pad)] px-[var(--inv-section-4-pad-1)] py-[var(--inv-section-4-pad)] bg-[var(--inv-section-4-bg)] border-b border-[var(--inv-section-4-border)] shrink-0">
            <h1 className="text-lg font-semibold text-[var(--inv-section-4-text)]">{title}</h1>

            {/* Search bar */}
            <div className="relative ml-auto">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--inv-section-4-text-1)]"
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
                className="pl-[var(--inv-section-4-pad-3)] pr-[var(--inv-section-4-pad)] py-[var(--inv-section-4-pad-2)] text-sm bg-[var(--inv-section-4-bg-1)] rounded-[var(--inv-section-4-radius)] border border-[var(--inv-section-4-border)] focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors w-56"
                aria-label="Search"
              />
            </div>

            {/* Notification bell */}
            <button
              type="button"
              className="relative p-[var(--inv-section-4-pad-2)] rounded-[var(--inv-section-4-radius)] text-[var(--inv-section-4-text-2)] hover:bg-gray-100 hover:text-gray-700 transition-colors"
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
                <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--inv-section-4-bg-2)] rounded-full" aria-hidden="true" />
              )}
            </button>
          </header></m.slot>
  )
}
