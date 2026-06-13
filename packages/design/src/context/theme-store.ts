'use client'

import type { AnyThemeJson } from '../config/types'

export interface ThemeStore {
  getTheme(): AnyThemeJson | null
  setTheme(theme: AnyThemeJson): void
  clear(): void
  subscribe(listener: () => void): () => void
  getSnapshot(): AnyThemeJson | null
}

export function createThemeStore(initial?: AnyThemeJson | null): ThemeStore {
  let current: AnyThemeJson | null = initial ?? null
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

    setTheme(theme: AnyThemeJson) {
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
