'use client'

import type { ReactNode } from 'react'
import { m } from '@invariance/design'
import { Reveal, SectionHeader } from '@invariance/kit'

import type { Title } from '../lib/titles'
import { PosterArt, TitleCard, posterFallbackStyle } from './title-card'
import { useTitleModal } from './title-modal-context'

export interface RowComponentProps {
  // The titles this row renders. Passed both directly (default render) and via
  // the F4 component-swap path (Slot forwards slotProps to the swapped library
  // component), so every row component must accept the same shape.
  titles?: Title[]
  shape?: 'standard' | 'wide'
  // Optional heading. Rides in slotProps too: an F4 swap replaces the slot's
  // whole subtree, so the swapped row must render its own header.
  heading?: string
  headingName?: string
  index?: number
}

// Card sizing per shape. Carousel widths are fixed so the scroll-snap strip
// reads as a true horizontal rail; grid uses responsive column counts.
const CARD_WIDTH: Record<'standard' | 'wide', string> = {
  standard: 'w-card',
  wide: 'w-card-wide',
}

function RowFrame({ heading, headingName, index, children }: Omit<RowComponentProps, 'titles' | 'shape'> & { children: ReactNode }) {
  if (!heading) return <>{children}</>
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader index={index ?? 0}>
        {headingName ? <m.text name={headingName}>{heading}</m.text> : heading}
      </SectionHeader>
      {children}
    </section>
  )
}

// Horizontal scroll-snap strip — the default row treatment.
export function CarouselRow({ titles = [], shape = 'standard', ...frame }: RowComponentProps) {
  return (
    <RowFrame {...frame}>
      <div className="inv-carousel flex snap-x snap-mandatory gap-sm overflow-x-auto px-1 pb-3 pt-1">
        {titles.map((title, i) => (
          <Reveal key={title.id} index={i} className={`${CARD_WIDTH[shape]} shrink-0 snap-start`}>
            <TitleCard title={title} shape={shape} />
          </Reveal>
        ))}
      </div>
    </RowFrame>
  )
}

// Wrapped grid — the F4 swap alternative for the same slot.
export function GridRow({ titles = [], shape = 'standard', ...frame }: RowComponentProps) {
  const cols = shape === 'wide' ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6'
  return (
    <RowFrame {...frame}>
      <div className={`grid gap-sm ${cols}`}>
        {titles.map((title, i) => (
          <Reveal key={title.id} index={i}>
            <TitleCard title={title} shape={shape} />
          </Reveal>
        ))}
      </div>
    </RowFrame>
  )
}

// Ranked index — a dense, typographic listing (terminal / data-forward vibes).
export function ListRow({ titles = [], ...frame }: RowComponentProps) {
  const { openTitle } = useTitleModal()
  return (
    <RowFrame {...frame}>
      <ol className="grid gap-x-lg sm:grid-cols-2">
        {titles.map((title, i) => (
          <Reveal key={title.id} index={i}>
            <li>
              <button
                type="button"
                onClick={() => openTitle(title.id)}
                aria-label={`View details for ${title.title}`}
                className="group/item flex w-full items-center gap-sm border-b border-border py-2 text-left transition-colors hover:bg-surface1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-title-id={title.id}
              >
                <span className="w-10 shrink-0 text-right font-mono text-2xl font-bold tabular-nums text-accent">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="relative h-12 w-20 shrink-0 overflow-hidden rounded-base" style={posterFallbackStyle(title.hue)}>
                  <PosterArt title={title} shape="wide" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-display text-sm font-semibold text-textPrimary group-hover/item:text-accent">
                    {title.title}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-textSecondary">
                    {title.genre} · {title.year} · {title.durationMin}m
                  </span>
                </span>
                <span className="shrink-0 rounded-base border border-border px-1.5 py-0.5 font-mono text-[10px] text-textSecondary">
                  {title.maturity}
                </span>
              </button>
            </li>
          </Reveal>
        ))}
      </ol>
    </RowFrame>
  )
}

// Feature + supporting grid: the lead title gets a large 16:9 billing with its
// synopsis, the rest sit beside it (editorial / cinematic vibes).
export function SpotlightRow({ titles = [], shape = 'standard', ...frame }: RowComponentProps) {
  const { openTitle } = useTitleModal()
  const [lead, ...rest] = titles
  if (!lead) return <RowFrame {...frame}>{null}</RowFrame>
  return (
    <RowFrame {...frame}>
      <div className="grid gap-md lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Reveal>
          <button
            type="button"
            onClick={() => openTitle(lead.id)}
            aria-label={`View details for ${lead.title}`}
            className="group/lead flex w-full flex-col gap-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-title-id={lead.id}
          >
            <span
              className="relative block aspect-[16/9] w-full overflow-hidden rounded-lg2 shadow-inv2 transition-transform duration-300 group-hover/lead:scale-[1.01]"
              style={posterFallbackStyle(lead.hue)}
            >
              <PosterArt title={lead} shape="wide" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
              {lead.genre} · {lead.year}
            </span>
            <span className="font-display text-2xl font-semibold leading-tight text-textPrimary group-hover/lead:text-accent">
              {lead.title}
            </span>
            <span className="max-w-prose text-sm text-textSecondary">{lead.synopsis}</span>
          </button>
        </Reveal>
        <div className={`grid gap-sm ${shape === 'wide' ? 'grid-cols-2' : 'grid-cols-3 sm:grid-cols-4'} content-start`}>
          {rest.map((title, i) => (
            <Reveal key={title.id} index={i + 1}>
              <TitleCard title={title} shape={shape} />
            </Reveal>
          ))}
        </div>
      </div>
    </RowFrame>
  )
}
