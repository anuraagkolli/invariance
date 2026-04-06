import type { ThemeJson } from '../config/types'

export interface StorageBackend {
  loadTheme(userId: string, appId: string): Promise<ThemeJson | null>
  saveTheme(userId: string, appId: string, theme: ThemeJson): Promise<void>
  getVersion(userId: string, appId: string): Promise<number>
}
