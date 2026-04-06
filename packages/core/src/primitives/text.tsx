'use client'

import { useEffect } from 'react'

import { useInvariance } from '../context/provider'

interface TextProps {
  name: string
  children: string
  maxLength?: number
  required?: boolean
}

export function Text({ name, children, maxLength, required }: TextProps) {
  const { registry } = useInvariance()

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

  // Content overrides are applied at the DOM level via data-inv-id
  return <span data-inv-text={name} data-inv-id={name}>{children}</span>
}
