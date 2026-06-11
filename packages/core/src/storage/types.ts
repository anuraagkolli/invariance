import type { AnyThemeJson } from '../config/types'

export interface StorageBackend {
  loadTheme(userId: string, appId: string): Promise<AnyThemeJson | null>
  saveTheme(userId: string, appId: string, theme: AnyThemeJson): Promise<void>
  getVersion(userId: string, appId: string): Promise<number>
}
