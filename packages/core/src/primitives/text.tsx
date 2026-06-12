'use client'

import { useEffect } from 'react'

import { useInvariance } from '../context/provider'
import { resolveTextOverride } from '../runtime/resolve-overrides'

interface TextProps {
  name: string
  children: string
  maxLength?: number
  required?: boolean
}

export function Text({ name, children, maxLength, required }: TextProps) {
  const { registry, themeJson } = useInvariance()

  useEffect(() => {
    const textConfig: { maxLength?: number; required?: boolean } = {}
    if (maxLength !== undefined) textConfig.maxLength = maxLength
    if (required !== undefined) textConfig.required = required
    registry.register({
      name,
      level: 2,
      pageName: '',
      preserve: false,
      alternativesCount: 0,
      type: 'text',
      ...(Object.keys(textConfig).length > 0 ? { textConfig } : {}),
    })
    return () => registry.unregister(name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // F2 is render-driven: the override resolves from theme context here, so React
  // owns the text node. The old DOM applier (data-inv-id query + textContent set)
  // was reverted on any re-render; resolving in render makes the override stick.
  const page = typeof window !== 'undefined' ? window.location.pathname : '/'
  const override = resolveTextOverride(themeJson, page, name)
  return <span data-inv-text={name} data-inv-id={name}>{override ?? children}</span>
}
