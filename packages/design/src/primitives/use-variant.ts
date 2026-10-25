'use client'

import { useInvarianceOptional } from '../context/provider'
import { resolveVariant } from '../runtime/resolve-overrides'

// The active component variant for an axis (e.g. useVariant('card', 'poster')).
// Variants are global (not page-keyed), so the result is identical on the
// server and the first client render: no hydration gap. Outside a provider it
// returns the fallback, so kit components also render standalone.
export function useVariant<T extends string>(axis: string, fallback: T): T {
  const ctx = useInvarianceOptional()
  if (!ctx) return fallback
  return (resolveVariant(ctx.themeJson, ctx.config, axis) as T | undefined) ?? fallback
}
