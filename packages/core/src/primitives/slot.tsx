'use client'

import React, { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react'

import type { Level } from '../levels/index'
import { useInvariance } from '../context/provider'
import { ErrorBoundary } from './error-boundary'

interface SlotProps {
  name: string
  level: Level
  children: ReactNode
  props?: Record<string, unknown>
  preserve?: boolean
}

// Convert camelCase CSS property name to kebab-case
function toKebab(prop: string): string {
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

// Build a CSS rule string that cascades slot styles to direct children
function buildChildCss(name: string, styles: CSSProperties): string {
  const entries = Object.entries(styles)
  if (entries.length === 0) return ''
  const rules = entries.map(([k, v]) => `${toKebab(k)}: ${v} !important`).join('; ')
  return `[data-inv-slot="${name}"] > * { ${rules}; }`
}

export function Slot({
  name,
  level,
  children,
  props: slotProps,
  preserve,
}: SlotProps) {
  const { themeJson, componentLibrary, registry, themeStore } = useInvariance()

  useEffect(() => {
    registry.register({
      name,
      level,
      pageName: '',
      preserve: preserve ?? false,
      alternativesCount: 0,
      type: 'slot',
    })
    return () => registry.unregister(name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // F1: per-slot style overrides from theme.json
  const slotStyles: CSSProperties = (themeJson?.theme?.slots?.[name] ?? {}) as CSSProperties

  // Build CSS to cascade styles through to direct children (overrides Tailwind etc.)
  const childCss = useMemo(() => buildChildCss(name, slotStyles), [name, slotStyles])

  // F4: check for component swap
  if (level >= 4 && themeJson?.components && componentLibrary) {
    const page = typeof window !== 'undefined' ? window.location.pathname : '/'
    const selection = themeJson.components.pages?.[page]?.[name]
    if (selection) {
      const SwappedComponent = componentLibrary[selection.component]
      if (SwappedComponent) {
        return (
          <div data-inv-slot={name} data-inv-section={name} style={slotStyles}>
            {childCss && <style>{childCss}</style>}
            <ErrorBoundary slotName={name} onReset={() => themeStore.clear()}>
              <SwappedComponent {...(slotProps ?? {})} {...(selection.props ?? {})} />
            </ErrorBoundary>
          </div>
        )
      }
    }
  }

  return (
    <div data-inv-slot={name} data-inv-section={name} data-inv-level={level} style={slotStyles}>
      {childCss && <style>{childCss}</style>}
      {children}
    </div>
  )
}
