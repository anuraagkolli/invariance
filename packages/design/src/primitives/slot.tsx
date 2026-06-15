'use client'

import React, { useEffect, type ReactNode } from 'react'

import type { Level } from '../levels/index'
import type { SlotRegistration } from '../context/registry'
import { useInvariance } from '../context/provider'
import { useCurrentPage } from '../context/use-current-page'
import { ErrorBoundary } from './error-boundary'

/**
 * The registry entry for a slot. `pageName` is the current page (the URL
 * pathname `config.frontend.pages` is keyed by) — the Gatekeeper resolves a
 * slot's allowed level from `config.frontend.pages[pageName].level`, so this
 * MUST be the live page, not a placeholder, or every slot reads as level 0.
 */
export function buildSlotRegistration(
  page: string,
  args: {
    name: string
    level: Level
    // `?:` + `| undefined`: callers pass these straight from optional props
    // (so the value may be an explicit `undefined`), tests may omit them.
    preserve?: boolean | undefined
    cssVariables?: string[] | undefined
    description?: string | undefined
    aliases?: string[] | undefined
    source?: ('page' | 'component') | undefined
  },
): SlotRegistration {
  return {
    name: args.name,
    level: args.level,
    pageName: page,
    preserve: args.preserve ?? false,
    alternativesCount: 0,
    type: 'slot',
    source: args.source ?? 'page',
    ...(args.cssVariables && args.cssVariables.length > 0 ? { cssVariables: args.cssVariables } : {}),
    ...(args.description ? { description: args.description } : {}),
    ...(args.aliases && args.aliases.length > 0 ? { aliases: args.aliases } : {}),
  }
}

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
  // Declares whether this slot lives on a page or inside a shared component.
  // Defaults to 'page'. Used by future component-library scans.
  source?: 'page' | 'component'
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
  source,
}: SlotProps) {
  const { themeJson, componentLibrary, registry, themeStore } = useInvariance()
  // Hook called unconditionally at the top (the F4 read below is conditional).
  // '/' on server + first client render → the F4 swap can't cause a hydration
  // mismatch; the page-keyed component swap applies one frame after mount.
  const page = useCurrentPage()

  useEffect(() => {
    registry.register(
      buildSlotRegistration(page, { name, level, preserve, cssVariables, description, aliases, source }),
    )
    return () => registry.unregister(name)
    // Re-register when the resolved page changes: useCurrentPage returns '/' on
    // the server + first client render, then the real pathname after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  // F4: check for component swap
  if (level >= 4 && themeJson?.components && componentLibrary) {
    const selection = themeJson.components.pages?.[page]?.[name]
    if (selection) {
      const SwappedComponent = componentLibrary[selection.component]
      if (SwappedComponent) {
        return (
          <div data-inv-slot={name} data-inv-section={name} style={{ display: 'contents' }}>
            <ErrorBoundary slotName={name} onReset={() => themeStore.clear()}>
              <SwappedComponent {...(slotProps ?? {})} {...(selection.props ?? {})} />
            </ErrorBoundary>
          </div>
        )
      }
    }
  }

  // F1 styling flows exclusively through --inv-* variables on :root; the wrapper
  // stays layout-transparent so flex/grid parent-child relationships hold.
  return (
    <div data-inv-slot={name} data-inv-section={name} data-inv-level={level} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
