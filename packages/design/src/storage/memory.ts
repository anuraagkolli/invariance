import type { AnyThemeJson } from '../config/types'
import type { StorageBackend } from './types'

export function createMemoryStorage(): StorageBackend {
  const store = new Map<string, AnyThemeJson>()

  function key(userId: string, appId: string): string {
    return `${userId}:${appId}`
  }

  return {
    async loadTheme(userId, appId) {
      return store.get(key(userId, appId)) ?? null
    },

    // SaveThemeMeta is intentionally ignored: this backend stores only the
    // latest doc, so there is no history for provenance to attach to.
    async saveTheme(userId, appId, theme) {
      store.set(key(userId, appId), theme)
    },

    async getVersion(userId, appId) {
      const existing = store.get(key(userId, appId))
      return existing?.version ?? 0
    },
  }
}
