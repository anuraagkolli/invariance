'use client'

import type { ReactNode } from 'react'
import { motion, useReducedMotion, type TargetAndTransition, type Transition } from 'motion/react'
import { useVariant } from '@invariance/design'

import type { MotionLook } from './variants'

interface Preset {
  initial: TargetAndTransition
  transition: Transition
  stagger: number
}

export const MOTION_PRESETS: Record<Exclude<MotionLook, 'none'>, Preset> = {
  subtle: { initial: { opacity: 0, y: 8 }, transition: { duration: 0.4, ease: 'easeOut' }, stagger: 0.04 },
  springy: {
    initial: { opacity: 0, y: 24, scale: 0.97 },
    transition: { type: 'spring', stiffness: 180, damping: 18 },
    stagger: 0.06,
  },
  snappy: { initial: { opacity: 0, x: -16 }, transition: { duration: 0.18, ease: [0.2, 0, 0, 1] }, stagger: 0.025 },
  playful: {
    initial: { opacity: 0, y: 30, rotate: -2 },
    transition: { type: 'spring', stiffness: 260, damping: 12 },
    stagger: 0.07,
  },
}

const SETTLED = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }

export interface RevealProps {
  children: ReactNode
  /** Position within a group: delays the entrance by the preset's stagger. */
  index?: number
  className?: string
  look?: MotionLook
}

// Scroll-triggered entrance driven by the theme's `motion` variant. 'none' and
// prefers-reduced-motion render a plain div (no animation, no hidden state).
export function Reveal({ children, index = 0, className, look }: RevealProps) {
  const themed = useVariant<MotionLook>('motion', 'subtle')
  const active = look ?? themed
  const reduce = useReducedMotion()
  if (active === 'none' || reduce) {
    return <div className={className}>{children}</div>
  }
  const preset = MOTION_PRESETS[active]
  return (
    <motion.div
      className={className}
      initial={preset.initial}
      whileInView={SETTLED}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ ...preset.transition, delay: Math.min(index, 12) * preset.stagger }}
    >
      {children}
    </motion.div>
  )
}
