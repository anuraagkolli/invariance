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
  // Optional list of --inv-* CSS variable names the scanner wired into this
  // slot's source. Surfaced via the registry so the Builder can target them.
  cssVariables?: string[]
  // Optional human-readable description (e.g. "Left-hand vertical navigation")
  // shown to the Gatekeeper for natural-language slot disambiguation.
  description?: string
  // Optional alternate names the user may use to refer to this slot
  // (e.g. ['sidebar', 'left nav'] for a slot whose canonical name is 'nav').
  aliases?: string[]
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
  cssVariables,
  description,
  aliases,
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
      ...(cssVariables && cssVariables.length > 0 ? { cssVariables } : {}),
      ...(description ? { description } : {}),
      ...(aliases && aliases.length > 0 ? { aliases } : {}),
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

  // Use display:contents when no inline F1 styles are applied (the scanner CSS-variable path).
  // This keeps the wrapper layout-transparent so flex/grid parent-child relationships are preserved.
  const hasInlineStyles = Object.keys(slotStyles).length > 0
  const wrapperStyle: CSSProperties = hasInlineStyles
    ? slotStyles
    : { display: 'contents', ...slotStyles }

  return (
    <div data-inv-slot={name} data-inv-section={name} data-inv-level={level} style={wrapperStyle}>
      {childCss && <style>{childCss}</style>}
      {children}
    </div>
  )
}
