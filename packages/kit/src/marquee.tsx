'use client'

import type { CSSProperties, ReactNode } from 'react'

export interface MarqueeProps {
  items: ReactNode[]
  /** Seconds per full loop. */
  duration?: number
  className?: string
  separator?: ReactNode
}

// Infinite ticker: the item list is rendered twice and the track slides -50%,
// so the loop is seamless. Pauses on hover; static under reduced motion.
export function Marquee({ items, duration = 40, className, separator = '✦' }: MarqueeProps) {
  const run = (key: string) => (
    <div key={key} aria-hidden={key === 'b' ? true : undefined} className="flex shrink-0 items-center">
      {items.map((item, i) => (
        <span key={i} className="flex items-center">
          <span className="px-md">{item}</span>
          <span className="text-accent">{separator}</span>
        </span>
      ))}
    </div>
  )
  return (
    <div className={`group/marquee overflow-hidden ${className ?? ''}`}>
      <div
        className="flex w-max animate-inv-marquee group-hover/marquee:[animation-play-state:paused] motion-reduce:animate-none"
        style={{ '--inv-marquee-duration': `${duration}s` } as CSSProperties}
      >
        {run('a')}
        {run('b')}
      </div>
    </div>
  )
}
