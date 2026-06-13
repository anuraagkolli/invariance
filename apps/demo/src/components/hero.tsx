'use client'

import { m } from 'invariance'

import type { Title } from '../lib/titles'

interface HeroProps {
  title: Title
}

// Full-bleed billboard for the featured title. Backdrop fades the title's hue
// into surface-0 so the hero dissolves into the page below it.
function backdropStyle(hue: number): React.CSSProperties {
  const wash = `hsl(${hue} 52% 30%)`
  // Alpha lives inside the hsl() function: `hsl(...)40` is invalid CSS and the
  // browser drops the whole backgroundImage (the hero washes out to flat).
  const glow = `hsl(${hue} 68% 55% / 0.25)`
  return {
    backgroundImage: [
      `radial-gradient(90% 120% at 78% 8%, ${glow} 0%, transparent 50%)`,
      `linear-gradient(105deg, ${wash} 0%, var(--inv-surface-0) 62%)`,
    ].join(', '),
  }
}

export function Hero({ title }: HeroProps) {
  return (
    <section
      className="relative flex min-h-hero flex-col justify-center overflow-hidden text-[var(--inv-hero-text)]"
      style={backdropStyle(title.hue)}
    >
      {/* bottom fade into the page */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-surface0 to-transparent" />

      <div className="relative flex max-w-2xl flex-col gap-5 px-2xl py-2xl">
        <span className="font-mono text-xs uppercase tracking-[0.34em] text-accent">
          Featured Today
        </span>

        <h1
          className="font-display leading-[0.95] text-[var(--inv-hero-text)]"
          style={{
            fontSize: 'clamp(3rem, 6vw, 5rem)',
            textTransform: 'var(--inv-display-transform)' as React.CSSProperties['textTransform'],
            letterSpacing: 'var(--inv-display-tracking)',
            fontWeight: 'var(--inv-display-weight)' as React.CSSProperties['fontWeight'],
          }}
        >
          <m.text name="hero-title">{title.title}</m.text>
        </h1>

        <p className="max-w-xl text-base text-[var(--inv-hero-text)]/85 sm:text-lg">
          <m.text name="hero-tagline">
            {title.tagline ?? 'A Nebula Original event, streaming now.'}
          </m.text>
        </p>

        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--inv-hero-text)]/70">
          {title.year} · {title.genre} · {Math.floor(title.durationMin / 60)}h {title.durationMin % 60}m · {title.maturity}
        </p>

        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-base bg-accent px-6 py-2.5 text-sm font-semibold text-accentContrast transition-colors hover:bg-accentHover"
          >
            <span aria-hidden>▶</span> Play
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-base border bg-surface2 px-6 py-2.5 text-sm font-semibold text-textPrimary transition-colors hover:bg-surface1"
            style={{ borderColor: 'var(--inv-border)', borderWidth: 'var(--inv-border-width)' }}
          >
            <span aria-hidden>+</span> My List
          </button>
        </div>
      </div>
    </section>
  )
}
