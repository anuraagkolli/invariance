'use client'

import { useInvarianceOptional } from '../context/provider'
import { useCurrentPage } from '../context/use-current-page'
import { resolveVariant } from '../runtime/resolve-overrides'
import { useVariantScope } from './variant-scope'

// The active component variant for an axis (e.g. useVariant('card', 'poster')).
// Most specific pick wins: `axis@slot` for the enclosing slots (innermost
// first), then the bare axis; at each key the current page's picks beat the
// app-wide ones. Page-keyed picks follow useCurrentPage ('/' on the server and
// first client render), like F3/F4 overrides. Outside a provider it returns the
// fallback, so kit components also render standalone.
export function useVariant<T extends string>(axis: string, fallback: T): T {
  const ctx = useInvarianceOptional()
  const page = useCurrentPage()
  const slots = useVariantScope()
  if (!ctx) return fallback
  return (resolveVariant(ctx.themeJson, ctx.config, axis, { page, slots }) as T | undefined) ?? fallback
}
