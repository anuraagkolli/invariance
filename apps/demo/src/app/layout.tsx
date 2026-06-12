import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { renderThemeCss, themeFromCookieHeader } from 'invariance'

import './globals.css'
import { Providers } from './providers'
import { invarianceConfig } from '../lib/invariance-config'

export const metadata: Metadata = {
  title: 'Nebula',
  description: 'Stream the Nebula universe — a media-browsing demo for Invariance v6.',
}

// SSR theme inlining: read the cookie mirror off the request, render the same
// :root token block the client runtime writes, and inline it in <head> so first
// paint is themed (no flash before the client applies). Reading the request
// cookie opts this route into dynamic rendering — acceptable for the demo, and
// expected for any per-user themed app.
// The geo-grotesk pairing (Space Grotesk display + Inter body) loaded via
// Google Fonts so the default theme renders with its real faces.
export default function RootLayout({ children }: { children: ReactNode }) {
  const cookieHeader = headers().get('cookie')
  const ssrTheme = themeFromCookieHeader(cookieHeader, invarianceConfig)
  const ssrCss = renderThemeCss(ssrTheme, invarianceConfig)

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {ssrCss ? (
          <style id="inv-ssr-theme" dangerouslySetInnerHTML={{ __html: ssrCss }} />
        ) : null}
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
