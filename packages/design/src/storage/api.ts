import type { AnyThemeJson } from '../config/types'
import { canonicalStringify } from '../utils/canonical-json'
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
        return data as AnyThemeJson
      } catch {
        return null
      }
    },

    async saveTheme(userId, appId, theme, meta) {
      try {
        // Conditional spread: when no meta is passed the PUT body stays
        // byte-identical to the pre-provenance wire shape.
        await fetch(baseUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: canonicalStringify({ userId, appId, theme, ...(meta !== undefined ? { meta } : {}) }),
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
