'use client'

import type { CSSProperties, ReactNode } from 'react'
import { m, useVariant } from '@invariance/design'
import { Button, Marquee, Reveal } from '@invariance/kit'

import { ROWS, type Title } from '../lib/titles'
import type { HeroLook } from '../lib/invariance-config'
import { posterImageUrl } from './title-card'

interface HeroProps {
  title: Title
}

// Full-bleed wash for the featured title: fades its hue into surface-0 so the
// hero dissolves into the page below it.
function backdropStyle(hue: number): CSSProperties {
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

const DISPLAY: CSSProperties = {
  textTransform: 'var(--inv-display-transform)' as CSSProperties['textTransform'],
  letterSpacing: 'var(--inv-display-tracking)',
  fontWeight: 'var(--inv-display-weight)' as CSSProperties['fontWeight'],
}

function meta(title: Title): string {
  return `${title.year} · ${title.genre} · ${Math.floor(title.durationMin / 60)}h ${title.durationMin % 60}m · ${title.maturity}`
}

function Kicker({ className = '' }: { className?: string }) {
  return <span className={`font-mono text-xs uppercase tracking-[0.34em] text-accent ${className}`}>Featured Today</span>
}

function HeroTitle({ title, size, className = '' }: { title: Title; size: string; className?: string }) {
  return (
    <h1 className={`font-display leading-[0.95] text-[var(--inv-hero-text)] ${className}`} style={{ ...DISPLAY, fontSize: size }}>
      <m.text name="hero-title">{title.title}</m.text>
    </h1>
  )
}

function Tagline({ title, className = '' }: { title: Title; className?: string }) {
  return (
    <p className={`max-w-xl text-base text-[var(--inv-hero-text)]/85 sm:text-lg ${className}`}>
      <m.text name="hero-tagline">{title.tagline ?? 'A Nebula Original event, streaming now.'}</m.text>
    </p>
  )
}

function Actions({ className = '' }: { className?: string }) {
  return (
    <div className={`mt-2 flex flex-wrap gap-3 ${className}`}>
      <Button tone="primary">
        <span aria-hidden>▶</span> Play
      </Button>
      <Button tone="secondary">
        <span aria-hidden>+</span> My List
      </Button>
    </div>
  )
}

function Meta({ title, className = '' }: { title: Title; className?: string }) {
  return (
    <p className={`font-mono text-xs uppercase tracking-[0.18em] text-[var(--inv-hero-text)]/70 ${className}`}>{meta(title)}</p>
  )
}

function Stagger({ children }: { children: ReactNode[] }) {
  return (
    <>
      {children.map((child, i) => (
        <Reveal key={i} index={i}>
          {child}
        </Reveal>
      ))}
    </>
  )
}

// Classic streaming billboard: copy on a hue wash, left-aligned.
function Billboard({ title }: HeroProps) {
  return (
    <section
      className="relative flex min-h-hero flex-col justify-center overflow-hidden text-[var(--inv-hero-text)]"
      style={backdropStyle(title.hue)}
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-surface0 to-transparent" />
      <div className="relative flex max-w-2xl flex-col gap-5 px-2xl py-2xl">
        <Stagger>
          {[
            <Kicker key="k" />,
            <HeroTitle key="t" title={title} size="clamp(3rem, 6vw, 5rem)" />,
            <Tagline key="g" title={title} />,
            <Meta key="m" title={title} />,
            <Actions key="a" />,
          ]}
        </Stagger>
      </div>
    </section>
  )
}

// Two columns: copy on the left, the key art as a framed poster on the right.
function Split({ title }: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-surface1 text-[var(--inv-hero-text)]">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-[28rem] w-[28rem] rounded-full opacity-40 blur-3xl"
        style={{ background: 'var(--inv-accent)' }}
      />
      <div className="relative grid min-h-hero items-center gap-xl px-2xl py-2xl md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex flex-col gap-5">
          <Stagger>
            {[
              <Kicker key="k" />,
              <HeroTitle key="t" title={title} size="clamp(2.75rem, 5vw, 4.5rem)" />,
              <Tagline key="g" title={title} />,
              <Meta key="m" title={title} />,
              <Actions key="a" />,
            ]}
          </Stagger>
        </div>
        <Reveal index={2} className="hidden justify-self-center md:block">
          <div className="relative aspect-[2/3] w-64 rotate-2 overflow-hidden rounded-lg2 border-themed border-border shadow-inv2 lg:w-72">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={posterImageUrl(title.id, 'standard')} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 mix-blend-color opacity-30" style={{ background: `hsl(${title.hue} 80% 40%)` }} />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// Centered title card over a dimmed full-bleed still — a premiere poster.
function Centered({ title }: HeroProps) {
  return (
    <section className="relative flex min-h-hero items-center justify-center overflow-hidden text-center text-[var(--inv-hero-text)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={posterImageUrl(title.id, 'wide')} alt="" className="absolute inset-0 h-full w-full scale-105 object-cover opacity-40 blur-[2px]" />
      <div className="absolute inset-0" style={backdropStyle(title.hue)} />
      <div className="absolute inset-0 bg-gradient-to-t from-surface0 via-surface0/40 to-transparent" />
      <div className="relative flex max-w-3xl flex-col items-center gap-5 px-2xl py-2xl">
        <Stagger>
          {[
            <span key="k" className="rounded-full border border-accent/60 px-4 py-1">
              <Kicker />
            </span>,
            <HeroTitle key="t" title={title} size="clamp(3.25rem, 8vw, 6.5rem)" />,
            <Tagline key="g" title={title} className="mx-auto" />,
            <Meta key="m" title={title} />,
            <Actions key="a" className="justify-center" />,
          ]}
        </Stagger>
      </div>
    </section>
  )
}

// Loud ticker band of the catalog over a billboard — zine / arcade energy.
function MarqueeHero({ title }: HeroProps) {
  const ticker = ROWS.flatMap((r) => r.titles)
    .slice(0, 12)
    .map((t) => t.title)
  return (
    <section className="relative overflow-hidden text-[var(--inv-hero-text)]" style={backdropStyle(title.hue)}>
      <Marquee
        items={ticker}
        duration={50}
        className="border-y-2 border-textPrimary bg-accent py-2 font-display text-lg uppercase tracking-wider text-accentContrast"
      />
      <div className="relative grid min-h-[calc(var(--inv-hero-min-h)-3rem)] items-center gap-xl px-2xl py-xl md:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <div className="flex flex-col gap-5">
          <Stagger>
            {[
              <Kicker key="k" />,
              <HeroTitle key="t" title={title} size="clamp(3rem, 7vw, 5.75rem)" />,
              <Tagline key="g" title={title} />,
              <Meta key="m" title={title} />,
              <Actions key="a" />,
            ]}
          </Stagger>
        </div>
        <Reveal index={3} className="hidden md:block">
          <div className="relative aspect-[2/3] w-full max-w-[16rem] -rotate-3 overflow-hidden border-2 border-textPrimary shadow-[8px_8px_0_0_var(--inv-text-primary)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={posterImageUrl(title.id, 'standard')} alt="" className="absolute inset-0 h-full w-full object-cover" />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

const HEROES: Record<HeroLook, (props: HeroProps) => JSX.Element> = {
  billboard: Billboard,
  split: Split,
  centered: Centered,
  marquee: MarqueeHero,
}

// The hero's anatomy is a theme variant (`hero` axis, declared in the Nebula
// config); copy stays in m.text so F2 renames survive every layout.
export function Hero({ title }: HeroProps) {
  const look = useVariant<HeroLook>('hero', 'billboard')
  const Layout = HEROES[look] ?? Billboard
  return (
    <div data-inv-variant={look}>
      <Layout title={title} />
    </div>
  )
}
