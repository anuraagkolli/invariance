'use client'

import React, { type ReactNode } from 'react'

import { useInvariance } from '../context/provider'
import { useCurrentPage } from '../context/use-current-page'
import { layoutForPage, orderSectionKeys } from '../runtime/resolve-overrides'

interface SectionsProps {
  children: ReactNode
}

// F3 is render-driven: the order/visibility of sections IS the render, so React
// reconciliation can never fight it (the v5 DOM applier it replaces could be
// silently reverted by any re-render that re-mounted or re-ordered the nodes).
//
// Each child is keyed by its `name` prop — the m.slot wrapper name the layout
// references. Non-element children, or elements without a `name`, render last,
// unordered, and are never hidden (defensive: we only reorder what we can key).
export function Sections({ children }: SectionsProps) {
  const { themeJson } = useInvariance()
  // useCurrentPage = '/' on server + first client render so SSR and hydration
  // produce the same section order; a real-path reorder/hide swaps in a frame later.
  const page = useCurrentPage()
  const layout = layoutForPage(themeJson, page)

  const childArray = React.Children.toArray(children)

  // Map keyable children (element with a string `name` prop) to their key, and
  // collect the unkeyable tail so it survives ordering/hiding untouched.
  const byKey = new Map<string, ReactNode>()
  const keys: string[] = []
  const unkeyed: ReactNode[] = []
  for (const child of childArray) {
    if (React.isValidElement(child) && typeof child.props?.name === 'string') {
      const key = child.props.name
      byKey.set(key, child)
      keys.push(key)
    } else {
      unkeyed.push(child)
    }
  }

  const orderedKeys = orderSectionKeys(keys, layout)
  const orderedChildren = orderedKeys.map((k) => byKey.get(k))

  return (
    <div data-inv-sections style={{ display: 'contents' }}>
      {orderedChildren}
      {unkeyed}
    </div>
  )
}
