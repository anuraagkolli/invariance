'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  THEME_PACKS,
  compileTheme,
  googleFontsUrlFor,
  type ThemePack,
} from '@invariance/design'

import { MiniNebula } from '../../components/mini-nebula'

// The "ten coherent vibes at a glance" shot: every theme pack rendered on ONE
// page, each on a scaled-down mini-Nebula card themed INDEPENDENTLY.
//
// Mechanism — wrapper-scoped custom properties. The demo's components consume
// var(--inv-*), and CSS custom properties cascade. Setting the compiled role
// tokens as inline style on a card WRAPPER themes that card's whole subtree
// without ever touching :root, so ten different themes coexist on one page.
// (React supports custom properties in the inline `style` object.)

// Canonical ten-vibe order, matching the gauntlet.
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

// Minimal constraints: the showcase must allow every pairing and both modes, so
// we pass only the relational floors (mirrors the gauntlet's compile call).
// NOTE: deriveConstraints() takes a full InvarianceConfig, not an app tag, so we
// build the constraints object directly rather than deriveConstraints({app:...}).
const SHOWCASE_CONSTRAINTS = { contrast: 4.5, accent_chroma_max: 0.25 } as const

interface ShowcaseCard {
  pack: ThemePack
  // All role custom properties for this pack as an inline-style object. React's
  // CSSProperties has a `--${string}` index signature, so a map of `--inv-*`
  // entries is a valid style value and the props pass straight through to the DOM.
  vars: React.CSSProperties
}

function buildCards(): ShowcaseCard[] {
  const cards: ShowcaseCard[] = []
  for (const id of PACK_IDS) {
    const pack = THEME_PACKS.find((p) => p.id === id)
    if (!pack) continue
    try {
      const { roles } = compileTheme(pack.spec, SHOWCASE_CONSTRAINTS)
      // roles is a `--inv-*` -> value map (colors, fonts, radius, shadow,
      // density, border-width) — exactly the set the components read. As inline
      // style it scopes the whole theme to this card's wrapper. The cast bridges
      // Record<string,string> to CSSProperties: every key is a custom property,
      // which CSSProperties accepts via its `--${string}` index signature, but
      // the structural types aren't assignable without it.
      cards.push({ pack, vars: roles as React.CSSProperties })
    } catch (err) {
      // A pack that fails to compile is a compiler bug, not a render error — log
      // and skip so the rest of the wall still renders for the shot.
      console.error('[showcase] compileTheme failed for pack', id, err)
    }
  }
  return cards
}

export default function ShowcasePage() {
  // Compile once: packs and constraints are constant for the page's lifetime.
  const cards = useMemo(buildCards, [])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Inject every pairing's Google Fonts <link> so each card's display/body
    // faces are available simultaneously. The font families are part of the
    // per-card role vars (--inv-font-display/body/mono), so once the faces load
    // they cascade into the right card.
    //
    // Why NOT core's ensureFontsLoaded: it swaps to ONE active pairing (it
    // removes every other inv-font-* link before injecting), which is correct
    // for a single live theme but would leave only the last card's fonts loaded
    // here. The wall needs all ten at once, so we inject additively below.
    for (const { pack } of cards) injectPairingFont(pack.spec.fontPairing)
    setReady(true)
  }, [cards])

  return (
    <main
      className="min-h-screen bg-[#0a0b0d] px-6 py-12 text-white sm:px-10"
      data-showcase-ready={ready ? 'true' : undefined}
    >
      <header className="mx-auto max-w-6xl">
        <p className="font-mono text-xs uppercase tracking-[0.34em] text-white/50">
          Invariance · Theme Compiler
        </p>
        <h1
          className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Ten vibes. One compiler. Zero hand-tuning.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Each card is the same Nebula slice, themed by a single StyleSpec
          compiled to OKLCH role tokens — harmony and AA contrast guaranteed by
          construction, scoped per card with cascading custom properties.
        </p>
      </header>

      <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ pack, vars }) => (
          <section
            key={pack.id}
            data-showcase-card={pack.id}
            className="flex flex-col gap-3"
          >
            {/* Theme scope: every --inv-* token for this pack lives here, so the
                mini-app subtree themes entirely from this wrapper. */}
            <div
              style={vars}
              className="overflow-hidden rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.4)] ring-1 ring-white/10"
            >
              <div className="h-56">
                <MiniNebula />
              </div>
            </div>

            <div className="px-0.5">
              <h2 className="text-sm font-semibold text-white">{pack.name}</h2>
              <p className="mt-0.5 text-xs leading-snug text-white/50">
                {pack.spec.rationale}
              </p>
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}

// Additive Google Fonts injector for the wall: load a pairing's faces WITHOUT
// removing the previously-injected ones, so all ten cards' fonts coexist. Reuses
// core's pure googleFontsUrlFor (URL build + system-family filtering); keyed by a
// distinct `showcase-font-` id prefix so it can't collide with — or be swept by —
// core's single-active-pairing `inv-font-*` cleanup. Idempotent and SSR-safe.
function injectPairingFont(pairingId: string): void {
  if (typeof document === 'undefined') return
  const href = googleFontsUrlFor(pairingId)
  if (!href) return // pure-system pairing, or unknown id

  const linkId = `showcase-font-${pairingId}`
  if (document.getElementById(linkId)) return

  const link = document.createElement('link')
  link.id = linkId
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}
