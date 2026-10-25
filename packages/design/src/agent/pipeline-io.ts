import type { AnyThemeJson, ThemeJsonV2, InvarianceConfig } from '../config/types'
import type { ThemeStore } from '../context/theme-store'
import type { SaveThemeMeta, StorageBackend } from '../storage/types'
import { upgradeThemeJson } from '../config/upgrade'
import { applyAnyTheme } from '../runtime/apply'
import { beginSmoothThemeTransition } from '../runtime/smooth-transition'
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

// Preview a candidate WITHOUT committing it: paint the tokens on the live DOM
// so the author sees the real result, but write nothing to the store, the
// in-memory themeStore, or the SSR cookie. The committed theme stays the source
// of truth, so a later Discard can revert by re-applying it (and an approve
// calls persistAndApply with the same candidate). Same morph as a real apply so
// the preview reads identically to what gets saved.
export function applyPreview(
  context: Pick<PipelineIoContext, 'config'>,
  candidate: ThemeJsonV2,
): void {
  beginSmoothThemeTransition()
  applyAnyTheme(candidate, context.config)
}

export async function persistAndApply(
  context: PipelineIoContext,
  candidate: ThemeJsonV2,
  meta?: SaveThemeMeta,
): Promise<void> {
  await context.storageBackend.saveTheme(context.userId, context.appId, candidate, meta)
  context.themeStore.setTheme(candidate)
  // Arm the morph HERE, at the actual token write — not earlier in the
  // pipeline. saveTheme above can be a slow network PUT, and the transition
  // class self-clears after ~700ms, so arming before the await could expire
  // mid-save and the swap would snap instead of morphing. This is the single
  // shared apply path (pipeline + packs), so every apply gets the morph.
  beginSmoothThemeTransition()
  applyAnyTheme(candidate, context.config)
  // Mirror the just-applied theme to the cookie so the next SSR request paints
  // it on first byte. The storage backend above stays the source of truth.
  mirrorThemeCookie(context.appId, candidate)
}
