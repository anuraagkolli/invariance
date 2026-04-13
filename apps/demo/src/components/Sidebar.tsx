import { m } from "invariance";
import type { ReactNode } from 'react'
import type { NavItem, User } from '@/lib/types'

interface SidebarProps {
  navigationItems: NavItem[]
  user: User
}

function Icon({ name }: { name: string }) {
  const icons: Record<string, ReactNode> = {
    grid: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
    'bar-chart': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    ),
    settings: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    'help-circle': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  }
  return <>{icons[name] ?? null}</>
}

export function Sidebar({ navigationItems, user }: SidebarProps) {
  return (
    <m.slot name="nav" level={0} preserve={true} cssVariables={['--inv-nav-bg', '--inv-nav-text', '--inv-nav-border', '--inv-nav-bg-1', '--inv-nav-text-1', '--inv-nav-text-2', '--inv-nav-bg-2', '--inv-nav-text-3', '--inv-nav-pad', '--inv-nav-pad-1', '--inv-nav-radius', '--inv-nav-pad-2', '--inv-nav-pad-3']}><nav className="flex flex-col w-64 h-full bg-[var(--inv-nav-bg)] text-[var(--inv-nav-text)] shrink-0">
            {/* Logo / app name */}
            <div className="flex items-center gap-[var(--inv-nav-pad)] px-[var(--inv-nav-pad-1)] py-[var(--inv-nav-pad-1)] border-b border-[var(--inv-nav-border)]">
              <div className="w-8 h-8 rounded-[var(--inv-nav-radius)] bg-[var(--inv-nav-bg-1)] flex items-center justify-center text-[var(--inv-nav-text-1)] font-bold text-sm">
                <m.text name="app-icon">I
                                </m.text></div>
              <span className="font-semibold text-[var(--inv-nav-text-1)]"><m.text name="app-name">Invariance</m.text></span>
            </div>

            {/* Navigation links */}
            <ul className="flex-1 px-[var(--inv-nav-pad)] py-[var(--inv-nav-pad-2)] space-y-1">
              {navigationItems.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="flex items-center gap-[var(--inv-nav-pad)] px-[var(--inv-nav-pad)] py-[var(--inv-nav-pad-3)] rounded-[var(--inv-nav-radius)] text-sm font-medium text-[var(--inv-nav-text-2)] hover:bg-gray-800 hover:text-white transition-colors"
                  >
                    {item.icon && <Icon name={item.icon} />}
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>

            {/* User info */}
            <div className="px-[var(--inv-nav-pad-2)] py-[var(--inv-nav-pad-2)] border-t border-[var(--inv-nav-border)] flex items-center gap-[var(--inv-nav-pad)]">
              <div className="w-8 h-8 rounded-full bg-[var(--inv-nav-bg-2)] flex items-center justify-center text-[var(--inv-nav-text-1)] text-xs font-semibold shrink-0">
                {user.initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--inv-nav-text)] truncate">{user.name}</p>
                <p className="text-xs text-[var(--inv-nav-text-3)] truncate">{user.email}</p>
              </div>
            </div>
          </nav></m.slot>
  )
}
