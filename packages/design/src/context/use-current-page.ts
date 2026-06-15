'use client'

import { useEffect, useState } from 'react'

// Returns '/' during SSR AND the first client render, then the real pathname
// after mount. WHY: server and client must render IDENTICAL output on the first
// pass or React throws a hydration mismatch. The server has no pathname (it
// renders the layout for whatever route, defaulting to '/'), so the client's
// first render must also use '/' to match — only after useEffect runs (post-
// hydration) do we swap in window.location.pathname.
//
// Consequence by feature: F1 tokens live on :root and are path-independent, so
// they carry the no-flash guarantee untouched. F2 (text) and F3 (sections) /
// F4 (component swaps) are page-keyed, so an override for the real path appears
// one frame after hydration instead of on first paint — an acceptable trade for
// hydration correctness (the alternative is a hard React error).
export function useCurrentPage(): string {
  const [page, setPage] = useState('/')

  useEffect(() => {
    if (typeof window !== 'undefined') setPage(window.location.pathname)
  }, [])

  return page
}
