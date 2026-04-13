import { m } from "invariance";

interface HeaderProps {
  title: string
  notificationCount: number
}

export function Header({ title, notificationCount }: HeaderProps) {
  return (
    <m.slot name="header" level={0} preserve={true} cssVariables={['--inv-header-bg', '--inv-header-border', '--inv-header-text', '--inv-header-text-1', '--inv-header-text-2', '--inv-header-bg-1', '--inv-header-bg-2', '--inv-header-pad', '--inv-header-pad-1', '--inv-header-pad-2', '--inv-header-radius', '--inv-header-pad-3']}><header className="flex items-center gap-[var(--inv-header-pad)] px-[var(--inv-header-pad-1)] py-[var(--inv-header-pad)] bg-[var(--inv-header-bg)] border-b border-[var(--inv-header-border)] shrink-0">
            <h1 className="text-lg font-semibold text-[var(--inv-header-text)]">{title}</h1>

            {/* Search bar */}
            <div className="relative ml-auto">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--inv-header-text-1)]"
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
                className="pl-[var(--inv-header-pad-3)] pr-[var(--inv-header-pad)] py-[var(--inv-header-pad-2)] text-sm bg-[var(--inv-header-bg-1)] rounded-[var(--inv-header-radius)] border border-[var(--inv-header-border)] focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors w-56"
                aria-label="Search"
              />
            </div>

            {/* Notification bell */}
            <button
              type="button"
              className="relative p-[var(--inv-header-pad-2)] rounded-[var(--inv-header-radius)] text-[var(--inv-header-text-2)] hover:bg-gray-100 hover:text-gray-700 transition-colors"
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
                <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--inv-header-bg-2)] rounded-full" aria-hidden="true" />
              )}
            </button>
          </header></m.slot>
  )
}
