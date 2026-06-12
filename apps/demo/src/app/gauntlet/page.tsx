'use client'

// force-dynamic: useSearchParams() requires it in Next 14 App Router to avoid
// static-build errors without a manual Suspense boundary at this level.
export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  THEME_PACKS,
  FONT_PAIRINGS,
  compileTheme,
  applyAnyTheme,
  type ThemeJsonV2,
} from 'invariance'

import { HomeScreen } from '../../components/home-screen'
import { invarianceConfig } from '../../lib/invariance-config'

// Ten gauntlet pack ids in the canonical order.
const PACK_IDS = [
  'retro-arcade',
  'neobrutalist',
  'soft-pastel',
  'terminal-green',
  'glass-dark',
  'editorial',
  'ocean',
  'sunset',
  'mono',
  'corporate-trust',
] as const

// ---------------------------------------------------------------------------
// Font injection
// ---------------------------------------------------------------------------

// Extract the primary family name from a CSS font stack like
// "'VT323', monospace" → "VT323"
// "'IBM Plex Mono', ui-monospace, monospace" → "IBM+Plex+Mono"
function extractGoogleFontName(cssStack: string): string | null {
  const match = cssStack.match(/['"]([^'"]+)['"]/)
  if (!match) return null
  const name = match[1]
  // System fonts and generic families are not on Google Fonts.
  const systemFonts = ['Inter', 'system-ui', 'ui-monospace', 'SF Mono', 'monospace', 'sans-serif', 'serif']
  if (systemFonts.some((s) => name.toLowerCase() === s.toLowerCase())) return null
  return name.replace(/ /g, '+')
}

// Injects a Google Fonts <link> into document.head, keyed by a stable id so
// repeated calls (e.g. React strict-mode double-invoke) are idempotent.
function injectGoogleFont(displayStack: string, bodyStack: string): void {
  if (typeof document === 'undefined') return

  const display = extractGoogleFontName(displayStack)
  const body = extractGoogleFontName(bodyStack)

  const families: string[] = []
  if (display) families.push(`family=${display}:wght@400;500;700`)
  if (body && body !== display) families.push(`family=${body}:wght@400;500;700`)
  if (families.length === 0) return

  const linkId = `gauntlet-font-${families.join('-').replace(/[^a-zA-Z0-9-]/g, '')}`
  if (document.getElementById(linkId)) return // already injected

  const href = `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
  const link = document.createElement('link')
  link.id = linkId
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

// ---------------------------------------------------------------------------
// Gauntlet index
// ---------------------------------------------------------------------------

function GauntletIndex() {
  return (
    <div
      className="min-h-screen bg-surface0 px-6 py-12 sm:px-10"
      data-gauntlet-ready="true"
    >
      <h1 className="font-display text-3xl font-bold text-textPrimary">
        Visual Gauntlet
      </h1>
      <p className="mt-2 font-body text-sm text-textSecondary">
        Ten theme packs rendered on the full Nebula composition.
      </p>

      <ul className="mt-10 flex flex-col gap-2">
        <li>
          <a
            href="/gauntlet?pack=default"
            className="text-accent underline-offset-2 hover:underline font-body text-sm"
          >
            Default (no pack)
          </a>
        </li>
        <li>
          <a
            href="/gauntlet?sidebar=blue"
            className="text-accent underline-offset-2 hover:underline font-body text-sm"
          >
            Sidebar Blue (slot override)
          </a>
        </li>
        {PACK_IDS.map((id) => {
          const pack = THEME_PACKS.find((p) => p.id === id)
          return (
            <li key={id}>
              <a
                href={`/gauntlet?pack=${id}`}
                className="text-accent underline-offset-2 hover:underline font-body text-sm"
              >
                {pack?.name ?? id}
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gauntlet viewer: applies a pack + optional sidebar-blue overlay
// ---------------------------------------------------------------------------

function GauntletViewer() {
  const params = useSearchParams()
  const packId = params.get('pack') ?? null
  const sidebarBlue = params.get('sidebar') === 'blue'

  const [ready, setReady] = useState(false)
  // Track which pack/sidebar combo was last applied so the effect doesn't fire
  // on unrelated re-renders.
  const appliedKey = useRef<string>('')

  useEffect(() => {
    const key = `${packId ?? 'none'}|${sidebarBlue}`
    if (appliedKey.current === key) return
    appliedKey.current = key

    // --- resolve pack ---
    const pack = packId && packId !== 'default'
      ? THEME_PACKS.find((p) => p.id === packId) ?? null
      : null

    // Sidebar-blue contrast-verified slot pair (from core slot-edit tests).
    const sidebarSlots: Record<string, string> = sidebarBlue
      ? { '--inv-sidebar-bg': '#1b2a4a', '--inv-sidebar-text': '#f2f3f5' }
      : {}

    if (!pack) {
      // Default or unknown: only apply sidebar slots if present.
      if (sidebarBlue) {
        const theme: ThemeJsonV2 = {
          version: 2,
          base_app_version: 'v1',
          theme: { roles: {}, slots: sidebarSlots },
        }
        applyAnyTheme(theme, invarianceConfig)
      }
      setReady(true)
      return
    }

    // --- compile the pack ---
    // Omit font_registry: the gauntlet must allow every pairing in the registry.
    // Omit allowed_modes: packs span both light and dark.
    let roles: Record<string, string> = {}
    try {
      const compiled = compileTheme(pack.spec, {
        contrast: 4.5,
        accent_chroma_max: 0.25,
      })
      roles = compiled.roles
    } catch (err) {
      console.error('[gauntlet] compileTheme failed for pack', packId, err)
      setReady(true)
      return
    }

    // --- inject font ---
    const pairing = FONT_PAIRINGS.find((fp) => fp.id === pack.spec.fontPairing)
    if (pairing) {
      injectGoogleFont(pairing.display, pairing.body)
    }

    // --- build + apply v2 theme (pack roles merged with any slot overrides) ---
    const theme: ThemeJsonV2 = {
      version: 2,
      base_app_version: 'v1',
      theme: {
        roles,
        slots: sidebarSlots,
        styleSpec: pack.spec,
      },
    }
    applyAnyTheme(theme, invarianceConfig)
    setReady(true)
  }, [packId, sidebarBlue])

  return (
    <div data-gauntlet-ready={ready ? 'true' : undefined}>
      <HomeScreen />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Route: /gauntlet
// Renders the index when no ?pack or ?sidebar params are present, otherwise
// renders the full Nebula composition with the requested theme applied.
// ---------------------------------------------------------------------------

function GauntletContent() {
  const params = useSearchParams()
  const hasPack = params.has('pack')
  const hasSidebar = params.has('sidebar')

  if (!hasPack && !hasSidebar) {
    return <GauntletIndex />
  }
  return <GauntletViewer />
}

export default function GauntletPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface0 flex items-center justify-center">
          <span className="font-body text-sm text-textSecondary">Loading…</span>
        </div>
      }
    >
      <GauntletContent />
    </Suspense>
  )
}
