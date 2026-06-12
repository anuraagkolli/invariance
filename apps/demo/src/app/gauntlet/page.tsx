'use client'

// force-dynamic: useSearchParams() requires it in Next 14 App Router to avoid
// static-build errors without a manual Suspense boundary at this level.
export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  THEME_PACKS,
  compileTheme,
  applyAnyTheme,
  ensureFontsLoaded,
  useInvariance,
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
// F4 component-swap demo (?demo=f4)
// ---------------------------------------------------------------------------

// Swaps the Trending row from CarouselRow (horizontal scroll-snap strip) to
// GridRow (wrapped grid) using the components.pages map in a v2 theme. The
// slot's level={4} in home-screen.tsx enables the F4 branch in m.slot, which
// looks up componentLibrary[selection.component] and renders it instead.
//
// Pathname note: window.location.pathname on this route is '/gauntlet', so the
// components map must be keyed '/gauntlet' — matching the overrides variant.
function buildF4Theme(roles: Record<string, string>): ThemeJsonV2 {
  return {
    version: 2,
    base_app_version: 'v1',
    theme: { roles },
    components: {
      pages: {
        '/gauntlet': {
          'row-trending': { component: 'GridRow' },
        },
      },
    },
  }
}

// ---------------------------------------------------------------------------
// F2/F3 overrides demo (?demo=overrides)
// ---------------------------------------------------------------------------

// CAREFUL: the primitives resolve overrides against window.location.pathname,
// which on this route is '/gauntlet' (not '/'). The content/layout pages maps
// MUST be keyed by '/gauntlet' or the primitives will never match.
//
// content: rename the hero title (m.text name="hero-title") and the trending
//   row heading (m.text name="heading-trending").
// layout: reorder the carousel rows so acclaimed + trending lead, and hide the
//   continue-watching row. Keys are the m.slot wrapper names (row-*).
function buildOverridesTheme(roles: Record<string, string>): ThemeJsonV2 {
  return {
    version: 2,
    base_app_version: 'v1',
    theme: { roles },
    content: {
      pages: {
        '/gauntlet': {
          'hero-title': { text: 'STATIC OVERRIDE WORKS' },
          'heading-trending': { text: 'Trending (Renamed)' },
        },
      },
    },
    layout: {
      pages: {
        '/gauntlet': {
          sections: ['row-acclaimed', 'row-trending'],
          hidden: ['row-continue'],
        },
      },
    },
  }
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
        <li>
          <a
            href="/gauntlet?demo=overrides"
            className="text-accent underline-offset-2 hover:underline font-body text-sm"
          >
            F2/F3 Overrides (content rename + section reorder/hide)
          </a>
        </li>
        <li>
          <a
            href="/gauntlet?demo=f4"
            className="text-accent underline-offset-2 hover:underline font-body text-sm"
          >
            F4 Component Swap (Trending row: CarouselRow → GridRow)
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
  // F2/F3 demo: exercises content + layout overrides on top of the tokens.
  const overrides = params.get('demo') === 'overrides'
  // F4 demo: swaps 'row-trending' from CarouselRow to GridRow via the
  // components.pages map — the slot's level={4} enables the m.slot F4 branch.
  const f4swap = params.get('demo') === 'f4'

  // F2/F3/F4 are render-driven from CONTEXT, so those themes must reach the
  // primitives via the store — applyAnyTheme only writes tokens to :root.
  const { themeStore } = useInvariance()

  const [ready, setReady] = useState(false)
  // Track which pack/sidebar/demo combo was last applied so the effect doesn't
  // fire on unrelated re-renders.
  const appliedKey = useRef<string>('')

  useEffect(() => {
    const key = `${packId ?? 'none'}|${sidebarBlue}|${overrides}|${f4swap}`
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

    // --- compile the pack roles (empty when no pack: overrides ride defaults) ---
    let roles: Record<string, string> = {}
    const styleSpec = pack?.spec
    if (pack) {
      // Omit font_registry: the gauntlet must allow every pairing in the
      // registry. Omit allowed_modes: packs span both light and dark.
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
      // Core owns font loading now — looks the pairing up in the registry and
      // injects the keyed Google Fonts <link> (idempotent, system-family-safe).
      ensureFontsLoaded(pack.spec.fontPairing)
    }

    // --- tokens to :root (roles + any slot overrides) ---
    // Hoist tokenTheme so the F4 branch can spread it (needs roles+slots+styleSpec).
    const tokenTheme: ThemeJsonV2 = {
      version: 2,
      base_app_version: 'v1',
      theme: {
        roles,
        slots: sidebarSlots,
        ...(styleSpec ? { styleSpec } : {}),
      },
    }
    if (pack || sidebarBlue || overrides || f4swap) {
      applyAnyTheme(tokenTheme, invarianceConfig)
    }

    // --- F2/F3 overrides via the store so the primitives resolve them ---
    if (overrides) {
      themeStore.setTheme(buildOverridesTheme(roles))
    }

    // --- F4 component-swap: push theme with components map into the store ---
    // m.slot reads themeJson.components.pages[pathname][name] and swaps to
    // componentLibrary[selection.component] when level >= 4.
    // Spread tokenTheme first so the store holds the same roles/slots/styleSpec
    // that were applied to :root; buildF4Theme only carries roles, so we take
    // only its components section to avoid clobbering the token-bearing theme field.
    if (f4swap) {
      themeStore.setTheme({ ...tokenTheme, components: buildF4Theme(roles).components })
    }

    setReady(true)
  }, [packId, sidebarBlue, overrides, f4swap, themeStore])

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
  const hasDemo = params.has('demo')

  if (!hasPack && !hasSidebar && !hasDemo) {
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
