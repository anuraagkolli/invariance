import type { ThemeJson } from '../config/types'
import type { StorageBackend } from './types'

export function createMemoryStorage(): StorageBackend {
  const store = new Map<string, ThemeJson>()

  function key(userId: string, appId: string): string {
    return `${userId}:${appId}`
  }

  return {
    async loadTheme(userId, appId) {
      return store.get(key(userId, appId)) ?? null
    },

    async saveTheme(userId, appId, theme) {
      store.set(key(userId, appId), theme)
    },

    async getVersion(userId, appId) {
      const existing = store.get(key(userId, appId))
      return existing?.version ?? 0
    },
  }
}
