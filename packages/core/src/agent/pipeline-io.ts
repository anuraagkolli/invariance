import type { AnyThemeJson, ThemeJsonV2, InvarianceConfig } from '../config/types'
import type { ThemeStore } from '../context/theme-store'
import type { StorageBackend } from '../storage/types'
import { upgradeThemeJson } from '../config/upgrade'
import { applyAnyTheme } from '../runtime/apply'
import { mirrorThemeCookie } from '../storage/cookie-mirror'

// The minimal slice of PipelineContext the store/apply path actually touches.
// Both the LLM pipeline (pipeline.ts) and the LLM-free pack path (apply-pack.ts)
// load + persist v2 themes; sharing this interface keeps the two routes
// byte-identical instead of forking the persistence logic.
export interface PipelineIoContext {
  config: InvarianceConfig
  themeStore: ThemeStore
  storageBackend: StorageBackend
  userId: string
  appId: string
}

// Every route operates on v2: stored v1 (or nothing) upgrades exactly once here.
export async function loadCurrentV2(context: PipelineIoContext): Promise<ThemeJsonV2> {
  const stored: AnyThemeJson | null =
    context.themeStore.getTheme() ??
    await context.storageBackend.loadTheme(context.userId, context.appId)
  const { theme } = upgradeThemeJson(stored ?? { version: 1, base_app_version: 'v1' })
  return theme
}

export async function persistAndApply(context: PipelineIoContext, candidate: ThemeJsonV2): Promise<void> {
  await context.storageBackend.saveTheme(context.userId, context.appId, candidate)
  context.themeStore.setTheme(candidate)
  applyAnyTheme(candidate, context.config)
  // Mirror the just-applied theme to the cookie so the next SSR request paints
  // it on first byte. The storage backend above stays the source of truth.
  mirrorThemeCookie(context.appId, candidate)
}
