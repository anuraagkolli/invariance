import type { ReactNode } from 'react'

import './globals.css'

export const metadata = {
  title: 'Nebula',
  description: 'A clean Nebula for scanner onboarding.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>{children}</body>
    </html>
  )
}
