import type { AnyThemeJson } from '../config/types'

// Provenance for a save: what the user asked for and which route produced the
// change. Backends that keep history (a remote API) persist it alongside the
// theme; latest-doc-only backends (memory, localStorage) ignore it.
export interface SaveThemeMeta {
  prompt?: string
  source?: 'pipeline' | 'pack' | 'rollback'
  description?: string
}

export interface StorageBackend {
  loadTheme(userId: string, appId: string): Promise<AnyThemeJson | null>
  saveTheme(userId: string, appId: string, theme: AnyThemeJson, meta?: SaveThemeMeta): Promise<void>
  getVersion(userId: string, appId: string): Promise<number>
}
