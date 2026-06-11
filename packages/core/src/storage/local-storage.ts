import type { AnyThemeJson } from '../config/types'
import { canonicalStringify } from '../utils/canonical-json'
import type { StorageBackend } from './types'

export function createLocalStorage(): StorageBackend {
  function key(userId: string, appId: string): string {
    return `invariance:${appId}:${userId}`
  }

  return {
    async loadTheme(userId, appId) {
      try {
        const raw = localStorage.getItem(key(userId, appId))
        if (!raw) return null
        return JSON.parse(raw) as AnyThemeJson
      } catch {
        return null
      }
    },

    async saveTheme(userId, appId, theme) {
      try {
        localStorage.setItem(key(userId, appId), canonicalStringify(theme))
      } catch {
        // silently fail (SSR, incognito, quota exceeded)
      }
    },

    async getVersion(userId, appId) {
      try {
        const raw = localStorage.getItem(key(userId, appId))
        if (!raw) return 0
        const theme = JSON.parse(raw) as AnyThemeJson
        return theme.version ?? 0
      } catch {
        return 0
      }
    },
  }
}
