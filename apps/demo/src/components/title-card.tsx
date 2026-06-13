'use client'

import type { Title } from '../lib/titles'
import { ProgressBar } from './progress-bar'
import { useTitleModal } from './title-modal-context'

interface TitleCardProps {
  title: Title
  // 'standard' = 2:3 poster, 'wide' = 16:9 original
  shape?: 'standard' | 'wide'
}

function posterImageUrl(id: string, shape: 'standard' | 'wide'): string {
  const w = shape === 'wide' ? 640 : 400
  const h = shape === 'wide' ? 360 : 600
  return `https://picsum.photos/seed/${id}/${w}/${h}`
}

function posterFallbackStyle(hue: number): React.CSSProperties {
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

export function TitleCard({ title, shape = 'standard' }: TitleCardProps) {
  const aspect = shape === 'wide' ? 'aspect-[16/9]' : 'aspect-[2/3]'
  const { openTitle } = useTitleModal()
  return (
    <article className="group/card flex w-full flex-col gap-2" data-title-id={title.id}>
      <button
        type="button"
        onClick={() => openTitle(title.id)}
        aria-label={`View details for ${title.title}`}
        className="block w-full rounded-lg2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface0"
      >
        <div
          className={`relative ${aspect} w-full overflow-hidden rounded-lg2 shadow-inv1 ring-1 ring-inset ring-border/40 transition-all duration-200 ease-out group-hover/card:-translate-y-1 group-hover/card:shadow-inv2 group-hover/card:ring-2 group-hover/card:ring-ring`}
          style={posterFallbackStyle(title.hue)}
        >
          {/* real photo poster */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={posterImageUrl(title.id, shape)}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* hue-tinted overlay so the accent colour still reads through */}
          <div
            className="absolute inset-0 mix-blend-color opacity-30"
            style={{ background: `hsl(${title.hue} 80% 40%)` }}
          />

          {/* maturity badge */}
          <span className="absolute right-2 top-2 rounded-base bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-white backdrop-blur-sm">
            {title.maturity}
          </span>

          {/* bottom scrim + title */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3">
            <h3 className="font-display text-sm font-semibold uppercase leading-tight tracking-[0.14em] text-white drop-shadow-sm">
              {title.title}
            </h3>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/70">
              {title.genre} · {title.year}
            </p>
          </div>
        </div>
      </button>

      {typeof title.progress === 'number' && (
        <div className="flex flex-col gap-1 px-0.5">
          <ProgressBar value={title.progress} />
          <span className="font-mono text-[10px] uppercase tracking-wide text-textSecondary">
            {Math.round(title.progress * 100)}% watched
          </span>
        </div>
      )}
    </article>
  )
}
