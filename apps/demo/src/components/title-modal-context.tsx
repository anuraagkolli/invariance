'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// Holds which title id (if any) is currently expanded in the detail modal.
// Lives as its own context — separate from Invariance's theme context — so a
// click anywhere in the card grid can open the single root-level modal without
// prop-drilling a setter through every row and carousel.
interface TitleModalContextValue {
  // The id of the open title, or null when the modal is closed.
  selected: string | null
  openTitle: (id: string) => void
  close: () => void
}

const TitleModalContext = createContext<TitleModalContextValue | null>(null)

export function TitleModalProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null)

  // Stable identities so consumers (every TitleCard) don't re-render on each
  // open/close — only `selected` changes drive re-render where it's read.
  const openTitle = useCallback((id: string) => setSelected(id), [])
  const close = useCallback(() => setSelected(null), [])

  const value = useMemo<TitleModalContextValue>(
    () => ({ selected, openTitle, close }),
    [selected, openTitle, close],
  )

  return <TitleModalContext.Provider value={value}>{children}</TitleModalContext.Provider>
}

export function useTitleModal(): TitleModalContextValue {
  const ctx = useContext(TitleModalContext)
  if (!ctx) throw new Error('useTitleModal must be used within <TitleModalProvider>')
  return ctx
}
