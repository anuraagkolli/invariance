'use client'

import type { ThemeJson } from '../config/types'

export interface ThemeStore {
  getTheme(): ThemeJson | null
  setTheme(theme: ThemeJson): void
  clear(): void
  subscribe(listener: () => void): () => void
  getSnapshot(): ThemeJson | null
}

export function createThemeStore(initial?: ThemeJson | null): ThemeStore {
  let current: ThemeJson | null = initial ?? null
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    getTheme() {
      return current
    },

    setTheme(theme: ThemeJson) {
      current = theme
      notify()
    },

    clear() {
      current = null
      notify()
    },

    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    getSnapshot() {
      return current
    },
  }
}
