'use client'

import type { CSSProperties, ReactNode } from 'react'
import { m } from '@invariance/design'

const DISPLAY_STYLE: CSSProperties = {
  textTransform: 'var(--inv-display-transform)' as CSSProperties['textTransform'],
  letterSpacing: 'var(--inv-display-tracking)',
  fontWeight: 'var(--inv-display-weight)' as CSSProperties['fontWeight'],
}

// Kicker + themed page title + subtitle shared by the secondary routes.
export function PageIntro({ id, kicker, title, subtitle, children }: {
  id: string
  kicker: string
  title: string
  subtitle: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 px-2xl pt-2xl">
      <span className="font-mono text-xs uppercase tracking-[0.34em] text-accent">{kicker}</span>
      <h1 className="font-display text-3xl text-textPrimary sm:text-4xl" style={DISPLAY_STYLE}>
        <m.text name={`${id}-page-title`}>{title}</m.text>
      </h1>
      <p className="max-w-xl text-sm text-textSecondary">
        <m.text name={`${id}-page-subtitle`}>{subtitle}</m.text>
      </p>
      {children}
    </div>
  )
}
