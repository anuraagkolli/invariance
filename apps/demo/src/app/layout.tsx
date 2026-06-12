import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { renderThemeCss, themeFromCookieHeader } from 'invariance'

import './globals.css'
import { Providers } from './providers'
import { invarianceConfig } from '../lib/invariance-config'
import { mergeInvarianceConfig } from '../lib/dev-config'
import { readDevConfig } from '../lib/server/dev-config-store'

// metadataBase makes the OG image URL absolute on whatever host the demo is
// deployed to; set NEXT_PUBLIC_SITE_URL in production env.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:4321'),
  title: 'Nebula — an Invariance demo',
  description:
    'A streaming app that re-designs itself on request. Type a vibe, watch the whole UI re-theme — aesthetic coherence and AA contrast compiled in, with developer-defined invariants the model can never violate.',
  openGraph: {
    title: 'Nebula — an app that re-designs itself on request',
    description:
      'Type a vibe. The Theme Compiler does the rest: ten distinct, coherent, AA-compliant themes from one codebase. Built with Invariance.',
    images: ['/og.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nebula — an app that re-designs itself on request',
    description: 'Type a vibe. The Theme Compiler does the rest. Built with Invariance.',
    images: ['/og.png'],
  },
}

// SSR theme inlining: read the cookie mirror off the request, render the same
// :root token block the client runtime writes, and inline it in <head> so first
// paint is themed (no flash before the client applies). Reading the request
// cookie opts this route into dynamic rendering — acceptable for the demo, and
// expected for any per-user themed app.
// The geo-grotesk pairing (Space Grotesk display + Inter body) loaded via
// Google Fonts so the default theme renders with its real faces.
export default async function RootLayout({ children }: { children: ReactNode }) {
  // The developer's lock/unlock overlay merges into the static base config per
  // request — the cookie read below already forces dynamic rendering, so this
  // adds no new rendering-mode constraint. The same merged config feeds the
  // SSR helpers and the client provider, keeping the verify-on-load gate
  // consistent between first paint and hydration.
  const overlay = await readDevConfig()
  const config = mergeInvarianceConfig(invarianceConfig, overlay)
  const cookieHeader = headers().get('cookie')
  const ssrTheme = themeFromCookieHeader(cookieHeader, config)
  const ssrCss = renderThemeCss(ssrTheme, config)

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
        <Providers config={config}>{children}</Providers>
      </body>
    </html>
  )
}
