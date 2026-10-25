'use client'

import { createContext, useContext } from 'react'

// The slot names enclosing a component, innermost first. Slot provides it so a
// kit component can resolve `axis@slot` variant picks without the app passing
// anything down.
export const VariantScopeContext = createContext<readonly string[]>([])

export function useVariantScope(): readonly string[] {
  return useContext(VariantScopeContext)
}
