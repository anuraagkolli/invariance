interface HeaderProps {
  title: string
  notificationCount: number
}

export function Header({ title, notificationCount }: HeaderProps) {
  return (
    <header className="flex items-center gap-4 px-6 py-4 bg-white border-b border-gray-200 shrink-0">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>

      {/* Search bar */}
      <div className="relative ml-auto">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
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
          className="pl-9 pr-4 py-2 text-sm bg-gray-50 rounded-md border border-gray-200 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors w-56"
          aria-label="Search"
        />
      </div>

      {/* Notification bell */}
      <button
        type="button"
        className="relative p-2 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
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
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" />
        )}
      </button>
    </header>
  )
}
