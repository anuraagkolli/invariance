'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useVariant } from '@invariance/design'

import { sectionHeaderRecipe } from './recipes'
import type { SectionHeaderLook } from './variants'

export interface SectionHeaderProps {
  children: ReactNode
  /** 0-based position, shown by the `numbered` look. */
  index?: number
  /** Small label above the title for the `label` look (defaults to the index). */
  kicker?: ReactNode
  look?: SectionHeaderLook
  className?: string
}

// The theme's display typography tokens, so every look inherits the vibe's
// caps/tracking/weight on top of its own anatomy.
const DISPLAY_STYLE: CSSProperties = {
  textTransform: 'var(--inv-display-transform)' as CSSProperties['textTransform'],
  letterSpacing: 'var(--inv-display-tracking)',
  fontWeight: 'var(--inv-display-weight)' as CSSProperties['fontWeight'],
}

export function SectionHeader({ children, index = 0, kicker, look, className }: SectionHeaderProps) {
  const themed = useVariant<SectionHeaderLook>('section-header', 'plain')
  const active = look ?? themed
  const s = sectionHeaderRecipe({ look: active })
  const number = String(index + 1).padStart(2, '0')
  const title = (
    <h2 className={s.title()} style={DISPLAY_STYLE}>
      {children}
    </h2>
  )
  return (
    <div className={s.root({ class: className })} data-inv-variant={active}>
      {active === 'numbered' && <span className={s.adornment()}>{number}</span>}
      {active === 'label' && <span className={s.adornment()}>{kicker ?? `Section ${number}`}</span>}
      {title}
      {active === 'rule' && <span aria-hidden className={s.adornment()} />}
    </div>
  )
}
