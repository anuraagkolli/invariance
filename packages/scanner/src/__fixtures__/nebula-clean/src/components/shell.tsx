import type { ReactNode } from 'react'

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        className="bg-panel text-cloud border-line"
        style={{ width: '230px', padding: '16px', borderRight: '1px solid #707883' }}
      >
        <span style={{ fontWeight: 700 }}>Nebula</span>
      </aside>
      <div style={{ flex: 1 }}>
        <header className="bg-ink text-cloud" style={{ padding: '12px 24px' }}>
          <span>Browse</span>
        </header>
        <main style={{ padding: '24px' }}>{children}</main>
      </div>
    </div>
  )
}
