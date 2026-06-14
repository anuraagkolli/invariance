'use client'

import { useCallback, useEffect, useRef } from 'react'
import { m } from '@invariance/design'

import { findTitle, relatedTitles } from '../lib/titles'
import { CarouselRow } from './title-row'
import { useTitleModal } from './title-modal-context'

// Hue wash for the modal's full-bleed header, mirroring the hero's backdropStyle
// but fading into the modal panel token (not surface-0) so the gradient melts
// into the popup whatever the theme repaints the panel to.
function headerStyle(hue: number): React.CSSProperties {
  const wash = `hsl(${hue} 52% 32%)`
  // Alpha must live inside hsl(): `hsl(...)40` is invalid and the browser drops
  // the whole backgroundImage, washing the header to flat.
  const glow = `hsl(${hue} 70% 58% / 0.3)`
  return {
    backgroundImage: [
      `radial-gradient(85% 130% at 80% 0%, ${glow} 0%, transparent 55%)`,
      `linear-gradient(160deg, ${wash} 0%, var(--inv-modal-bg) 78%)`,
    ].join(', '),
  }
}

// Renders ONCE at the app root (mounted in providers.tsx). Reads the selected id
// from the modal context; renders nothing when closed so the page is untouched.
export function TitleDetailModal() {
  const { selected, close } = useTitleModal()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Esc closes; we attach the listener only while open so it never interferes
  // with other Esc handlers (e.g. the search overlay) when the modal is closed.
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, close])

  // Lock body scroll while the modal owns the viewport, move focus into the
  // dialog, and restore focus to the opener card on close.
  // We also mark the app root sibling inert so Tab can never escape the dialog
  // without relying on the keydown trap alone — belt-and-suspenders approach.
  useEffect(() => {
    if (!selected) return

    // Capture the element that triggered the modal so we can return focus to it
    // when the dialog closes; otherwise focus lands on body and the keyboard user
    // loses their place in the card grid.
    const opener = document.activeElement as HTMLElement | null

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Mark the page background inert so assistive technology and Tab navigation
    // cannot reach content outside the dialog while it is open.
    const appRoot = document.getElementById('__next') ?? document.getElementById('app-root')
    if (appRoot) {
      appRoot.setAttribute('aria-hidden', 'true')
      // `inert` is supported in all modern browsers (Chromium 102+, FF 112+, Safari 15.5+)
      ;(appRoot as HTMLElement & { inert?: boolean }).inert = true
    }

    closeRef.current?.focus()

    return () => {
      document.body.style.overflow = prevOverflow

      // Restore background to interactive before returning focus
      if (appRoot) {
        appRoot.removeAttribute('aria-hidden')
        ;(appRoot as HTMLElement & { inert?: boolean }).inert = false
      }

      // Return focus to the card that opened the modal; fall back to body
      // gracefully if the element has been unmounted.
      opener?.focus()
    }
  }, [selected])

  // Keep Tab within the panel: wrap at both edges (Shift+Tab from first →
  // last; Tab from last → first). We filter to visible, non-disabled elements
  // so hidden/disabled nodes are never included in the cycle. The inert-on-
  // background approach above is the primary trap; this is a secondary guard
  // for browsers that have partial inert support.
  const onKeyDownTrap = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const candidates = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    // Filter to only elements that are visible and enabled in the rendered tree
    const focusable = Array.from(candidates).filter((el) => {
      if ((el as HTMLButtonElement | HTMLInputElement).disabled) return false
      // offsetParent is null for elements with display:none or visibility:hidden
      // ancestors; use that as a cheap visibility guard without getComputedStyle.
      return el.offsetParent !== null || el.tagName === 'BODY'
    })
    if (focusable.length === 0) return
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    const active = document.activeElement
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }, [])

  if (!selected) return null
  const title = findTitle(selected)
  if (!title) return null

  const related = relatedTitles(title)
  const hours = Math.floor(title.durationMin / 60)
  const mins = title.durationMin % 60

  return (
    // Backdrop dims the page; clicking it (but not the panel) closes the modal.
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm sm:py-14"
      role="dialog"
      aria-modal="true"
      aria-label={`${title.title} details`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      onKeyDown={onKeyDownTrap}
    >
      <m.slot
        name="title-detail"
        level={1}
        cssVariables={['--inv-modal-bg', '--inv-modal-text']}
        description="Title detail popup"
        aliases={['detail', 'popup', 'title modal']}
      >
        <div
          ref={panelRef}
          className="relative w-full max-w-3xl overflow-hidden rounded-lg2 border bg-[var(--inv-modal-bg)] text-[var(--inv-modal-text)] shadow-inv2"
          style={{ borderColor: 'var(--inv-border)' }}
        >
          {/* Close button: floats over the hue header, always reachable. */}
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-surface0/70 text-textPrimary backdrop-blur-sm transition-colors hover:bg-surface0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ✕
          </button>

          {/* Full-bleed gradient header from the title hue. */}
          <div
            className="flex min-h-[220px] flex-col justify-end px-6 pb-6 pt-24 sm:min-h-[260px] sm:px-9 sm:pb-7"
            style={headerStyle(title.hue)}
          >
            <span className="font-mono text-xs uppercase tracking-[0.34em] text-accent">
              {title.genre}
            </span>
            <h2
              className="mt-2 font-display font-bold uppercase leading-[0.95] tracking-tight text-[var(--inv-modal-text)]"
              style={{ fontSize: 'clamp(2rem, 4.5vw, 3.25rem)' }}
            >
              {title.title}
            </h2>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-[var(--inv-modal-text)]/70">
              {title.year} · {title.genre} · {hours}h {mins}m · {title.maturity}
            </p>
          </div>

          {/* Body: synopsis, actions, cast, more-like-this. */}
          <div className="flex flex-col gap-6 px-6 py-6 sm:px-9 sm:py-8">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="flex items-center gap-2 rounded-base bg-accent px-6 py-2.5 text-sm font-semibold text-accentContrast transition-colors hover:bg-accentHover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden>▶</span> Play
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-base border bg-surface2 px-6 py-2.5 text-sm font-semibold text-textPrimary transition-colors hover:bg-surface1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ borderColor: 'var(--inv-border)' }}
              >
                <span aria-hidden>+</span> My List
              </button>
            </div>

            <p className="max-w-2xl text-base leading-relaxed text-[var(--inv-modal-text)]/90">
              {title.synopsis}
            </p>

            {title.cast && title.cast.length > 0 && (
              <p className="text-sm text-textSecondary">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-textDisabled">
                  Cast{' '}
                </span>
                {title.cast.join(', ')}
              </p>
            )}

            {related.length > 0 && (
              <section className="flex flex-col gap-3">
                <h3 className="font-display text-lg font-semibold tracking-tight text-[var(--inv-modal-text)]">
                  <m.text name="modal-more-like-this">More like this</m.text>
                </h3>
                <CarouselRow titles={related} shape="standard" />
              </section>
            )}
          </div>
        </div>
      </m.slot>
    </div>
  )
}
