'use client'

import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { motion, type MotionStyle, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { useVariant } from '@invariance/design'

import { CARD_CAPTION_PLACEMENT, cardRecipe } from './recipes'
import type { CardLook } from './variants'

export interface MediaCardProps {
  title: ReactNode
  meta?: ReactNode
  /** The art layer (an <img>, gradient, video…), absolutely fills the frame. */
  media: ReactNode
  /** Frame style, e.g. aspect ratio and a fallback background. */
  frameStyle?: CSSProperties
  frameClassName?: string
  /** Corner badge on the art (e.g. a rating). */
  badge?: ReactNode
  onSelect?: () => void
  ariaLabel?: string
  /** Rendered under the card (e.g. a progress bar). */
  footer?: ReactNode
  look?: CardLook
  'data-title-id'?: string
}

function TiltFrame({ children, className, style }: { children: ReactNode; className: string; style?: CSSProperties | undefined }) {
  const reduce = useReducedMotion()
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const rotateY = useSpring(useTransform(px, [0, 1], [-10, 10]), { stiffness: 220, damping: 20 })
  const rotateX = useSpring(useTransform(py, [0, 1], [10, -10]), { stiffness: 220, damping: 20 })
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    px.set((e.clientX - r.left) / r.width)
    py.set((e.clientY - r.top) / r.height)
  }
  const reset = () => {
    px.set(0.5)
    py.set(0.5)
  }
  return (
    <motion.div
      className={className}
      style={(reduce ? style : { ...style, rotateX, rotateY, transformStyle: 'preserve-3d' }) as MotionStyle}
      onPointerMove={reduce ? undefined : onMove}
      onPointerLeave={reset}
    >
      {children}
    </motion.div>
  )
}

// One card, six anatomies, chosen by the theme's `card` variant. The art and
// data are the app's; the kit owns frame, caption placement and hover physics.
export function MediaCard({
  title,
  meta,
  media,
  frameStyle,
  frameClassName,
  badge,
  onSelect,
  ariaLabel,
  footer,
  look,
  'data-title-id': titleId,
}: MediaCardProps) {
  const themed = useVariant<CardLook>('card', 'poster')
  const active = look ?? themed
  const s = cardRecipe({ look: active })
  const overlay = CARD_CAPTION_PLACEMENT[active] === 'overlay'
  const caption = (
    <div className={s.caption()}>
      <h3 className={s.title()}>{title}</h3>
      {meta !== undefined && <p className={s.meta()}>{meta}</p>}
    </div>
  )
  const frameInner = (
    <>
      {media}
      {badge !== undefined && (
        <span className="absolute right-2 top-2 rounded-base bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-white backdrop-blur-sm">
          {badge}
        </span>
      )}
      {overlay && caption}
    </>
  )
  const frameClass = s.frame({ class: frameClassName })
  return (
    <article className="flex w-full flex-col gap-2" data-title-id={titleId} data-inv-variant={active}>
      <button
        type="button"
        onClick={onSelect}
        aria-label={ariaLabel}
        className={`${s.root()} rounded-lg2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface0`}
      >
        {active === 'tilt' ? (
          <TiltFrame className={frameClass} style={frameStyle}>
            {frameInner}
          </TiltFrame>
        ) : (
          <div className={frameClass} style={frameStyle}>
            {frameInner}
          </div>
        )}
        {!overlay && caption}
      </button>
      {footer}
    </article>
  )
}
