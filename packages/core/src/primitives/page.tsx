import type { ReactNode } from 'react'

import { useInvariance } from '../context/provider'

interface PageProps {
  name: string
  children: ReactNode
}

export function Page({ name, children }: PageProps) {
  useInvariance()

  return (
    <div data-inv-page={name}>
      {children}
    </div>
  )
}
