import { describe, it, expect } from 'vitest'

import { patchLayoutSource } from './provider-injector'

const STOCK_LAYOUT = `import type { ReactNode } from 'react'
import './globals.css'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`

describe('patchLayoutSource', () => {
  it('wraps {children} in <Providers> and adds the import', () => {
    const out = patchLayoutSource(STOCK_LAYOUT)
    expect(out).not.toBeNull()
    expect(out).toContain(`import { Providers } from './providers'`)
    expect(out).toContain('<Providers>{children}</Providers>')
    // import goes after the last existing import, before the component body
    expect(out!.indexOf(`import { Providers }`)).toBeGreaterThan(
      out!.indexOf(`import './globals.css'`),
    )
  })

  it('is idempotent: running twice leaves the source unchanged', () => {
    const first = patchLayoutSource(STOCK_LAYOUT)!
    const second = patchLayoutSource(first)
    expect(second).toBe(first)
  })

  it('returns null when the layout does not reference {children}', () => {
    const weirdLayout = `export default function RootLayout() {
  return <html><body /></html>
}
`
    expect(patchLayoutSource(weirdLayout)).toBeNull()
  })

  it('prepends the import when there are no existing imports', () => {
    const bare = `export default function RootLayout({ children }) {
  return <html><body>{children}</body></html>
}
`
    const out = patchLayoutSource(bare)
    expect(out).not.toBeNull()
    expect(out!.startsWith(`import { Providers } from './providers'`)).toBe(true)
    expect(out).toContain('<Providers>{children}</Providers>')
  })
})
