import type { ThemeJson } from '../config/types'
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
        return JSON.parse(raw) as ThemeJson
      } catch {
        return null
      }
    },

    async saveTheme(userId, appId, theme) {
      try {
        localStorage.setItem(key(userId, appId), JSON.stringify(theme))
      } catch {
        // silently fail (SSR, incognito, quota exceeded)
      }
    },

    async getVersion(userId, appId) {
      try {
        const raw = localStorage.getItem(key(userId, appId))
        if (!raw) return 0
        const theme = JSON.parse(raw) as ThemeJson
        return theme.version ?? 0
      } catch {
        return 0
      }
    },
  }
}
