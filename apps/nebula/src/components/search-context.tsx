'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

// Coordinates the header search input, the results overlay, and the sidebar's
// "Search" nav item. Kept separate from the theme + modal contexts: search is a
// distinct UI concern, and the sidebar lives in a different subtree from the
// header, so a shared context is the clean way to let one focus the other.
interface SearchContextValue {
  query: string
  setQuery: (q: string) => void
  // True while the overlay should render (input focused or query non-empty).
  open: boolean
  openSearch: () => void
  closeSearch: () => void
  // Ref the header attaches to its <input> so "Search" nav / openSearch() can
  // move focus there without prop-drilling a ref through the shell.
  inputRef: React.RefObject<HTMLInputElement>
  // Focuses the header input (and opens the overlay). Used by the sidebar nav.
  focusInput: () => void
}

const SearchContext = createContext<SearchContextValue | null>(null)

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const openSearch = useCallback(() => setOpen(true), [])
  const closeSearch = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  const focusInput = useCallback(() => {
    setOpen(true)
    // Defer so the input is mounted/visible before we focus it (sidebar nav can
    // fire this from a route where the header just rendered).
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const value = useMemo<SearchContextValue>(
    () => ({ query, setQuery, open, openSearch, closeSearch, inputRef, focusInput }),
    [query, open, openSearch, closeSearch, focusInput],
  )

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext)
  if (!ctx) throw new Error('useSearch must be used within <SearchProvider>')
  return ctx
}
