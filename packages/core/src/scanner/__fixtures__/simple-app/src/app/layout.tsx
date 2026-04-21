import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body style={{ fontFamily: 'Inter, system-ui' }}>{children}</body>
    </html>
  )
}
