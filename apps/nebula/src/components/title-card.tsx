'use client'

import { MediaCard } from '@invariance/kit'

import type { Title } from '../lib/titles'
import { ProgressBar } from './progress-bar'
import { useTitleModal } from './title-modal-context'

interface TitleCardProps {
  title: Title
  // 'standard' = 2:3 poster, 'wide' = 16:9 original
  shape?: 'standard' | 'wide'
}

export function posterImageUrl(id: string, shape: 'standard' | 'wide'): string {
  const w = shape === 'wide' ? 640 : 400
  const h = shape === 'wide' ? 360 : 600
  return `https://picsum.photos/seed/${id}/${w}/${h}`
}

export function posterFallbackStyle(hue: number): React.CSSProperties {
  const top = `hsl(${hue} 55% 38%)`
  const bottom = `hsl(${(hue + 40) % 360} 60% 18%)`
  const glow = `hsl(${hue} 70% 62% / 0.33)`
  return {
    backgroundImage: [
      `radial-gradient(120% 80% at 75% 12%, ${glow} 0%, transparent 55%)`,
      `linear-gradient(160deg, ${top}, ${bottom})`,
    ].join(', '),
  }
}

// The poster art layer: real photo + a hue tint so the accent still reads.
export function PosterArt({ title, shape }: { title: Title; shape: 'standard' | 'wide' }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={posterImageUrl(title.id, shape)}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 mix-blend-color opacity-30" style={{ background: `hsl(${title.hue} 80% 40%)` }} />
    </>
  )
}

// Nebula supplies the art + data; the kit's MediaCard picks the anatomy
// (poster / caption / polaroid / framed / tilt / glass) from the theme.
export function TitleCard({ title, shape = 'standard' }: TitleCardProps) {
  // Originals stay 16:9 by design; standard posters take their aspect from the
  // theme's framing token so a spacious vibe can run taller posters.
  const isWide = shape === 'wide'
  const { openTitle } = useTitleModal()
  return (
    <MediaCard
      data-title-id={title.id}
      title={title.title}
      meta={`${title.genre} · ${title.year}`}
      badge={title.maturity}
      media={<PosterArt title={title} shape={shape} />}
      frameClassName={isWide ? 'aspect-[16/9]' : ''}
      frameStyle={isWide ? posterFallbackStyle(title.hue) : { ...posterFallbackStyle(title.hue), aspectRatio: 'var(--inv-card-aspect)' }}
      onSelect={() => openTitle(title.id)}
      ariaLabel={`View details for ${title.title}`}
      footer={
        typeof title.progress === 'number' ? (
          <div className="flex flex-col gap-1 px-0.5">
            <ProgressBar value={title.progress} />
            <span className="font-mono text-[10px] uppercase tracking-wide text-textSecondary">
              {Math.round(title.progress * 100)}% watched
            </span>
          </div>
        ) : undefined
      }
    />
  )
}
