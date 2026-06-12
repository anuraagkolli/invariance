'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// First-visit tour card: the 20-second script for a prospect who just opened
// the URL. Deliberately built ON the role tokens (surface/text/accent/font
// utilities) so it re-themes live along with the app — the card explaining the
// demo is itself proof of the demo. Dismissal sticks in localStorage.

const DISMISS_KEY = 'nebula:demo-tour:dismissed'

const STEPS = [
  { n: '1', text: 'Open the ✨ panel and type a vibe — try “make it retro”.' },
  { n: '2', text: 'The whole app re-themes. Harmony and AA contrast are compiled in, never asked of the model.' },
  { n: '3', text: 'Open the developer view: every edit versioned with its prompt, invariants you control.' },
]

function openPanel(): void {
  const trigger = document.querySelector<HTMLButtonElement>('[aria-label="Open customization panel"]')
  trigger?.click()
}

export function DemoTour() {
  // Render nothing until mounted so SSR output never flashes a card the
  // visitor already dismissed.
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(DISMISS_KEY)) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  function dismiss(): void {
    setVisible(false)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // incognito: the card simply returns next visit
    }
  }

  if (!visible) return null

  return (
    <aside
      aria-label="Demo tour"
      className="inv-tour-enter fixed bottom-5 left-5 z-40 w-[21rem] max-w-[calc(100vw-2.5rem)] rounded-lg2 border bg-surface1/95 p-4 shadow-inv2 backdrop-blur-md"
      style={{ borderColor: 'var(--inv-border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
          Nebula · an Invariance demo
        </p>
        <button
          type="button"
          aria-label="Dismiss tour"
          onClick={dismiss}
          className="-mr-1 -mt-1 rounded-base px-1.5 text-sm leading-none text-textSecondary transition-colors hover:bg-surface2 hover:text-textPrimary"
        >
          ✕
        </button>
      </div>

      <h2 className="mt-2 font-display text-lg font-bold leading-tight text-textPrimary">
        This app re-designs itself on request.
      </h2>

      <ol className="mt-3 flex flex-col gap-2">
        {STEPS.map(({ n, text }) => (
          <li key={n} className="flex gap-2.5 text-[13px] leading-snug text-textSecondary">
            <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-bold text-accentContrast">
              {n}
            </span>
            {text}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={openPanel}
          className="rounded-base bg-accent px-3 py-1.5 text-xs font-semibold text-accentContrast shadow-inv1 transition-transform hover:scale-[1.03]"
        >
          ✨ Try a vibe
        </button>
        <Link
          href="/dev"
          className="rounded-base border px-3 py-1.5 text-xs font-medium text-textPrimary transition-colors hover:bg-surface2"
          style={{ borderColor: 'var(--inv-border)' }}
        >
          Developer view
        </Link>
        <Link
          href="/showcase"
          className="px-1 text-xs text-textSecondary underline-offset-2 hover:text-textPrimary hover:underline"
        >
          10 themes
        </Link>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-textDisabled">
        Even this card re-themes — it reads the same role tokens as the app.
      </p>
    </aside>
  )
}
