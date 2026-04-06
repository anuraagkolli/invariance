import type { ThemeJson } from '../config/types'
import type { StorageBackend } from './types'

export function createApiStorage(baseUrl: string): StorageBackend {
  return {
    async loadTheme(userId, appId) {
      try {
        const res = await fetch(
          `${baseUrl}?userId=${encodeURIComponent(userId)}&appId=${encodeURIComponent(appId)}`,
        )
        if (!res.ok) return null
        const data = await res.json()
        if (!data || typeof data !== 'object' || !('version' in data)) return null
        return data as ThemeJson
      } catch {
        return null
      }
    },

    async saveTheme(userId, appId, theme) {
      try {
        await fetch(baseUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, appId, theme }),
        })
      } catch {
        // silently fail
      }
    },

    async getVersion(userId, appId) {
      const theme = await this.loadTheme(userId, appId)
      return theme?.version ?? 0
    },
  }
}
