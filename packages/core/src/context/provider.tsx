'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import type { InvarianceConfig, AnyThemeJson } from '../config/types'
import type { UsageHandler } from '../agent/api'
import { createThemeStore, type ThemeStore } from './theme-store'
import { createSlotRegistry, type SlotRegistry } from './registry'
import { createMemoryStorage } from '../storage/memory'
import { createLocalStorage } from '../storage/local-storage'
import { createApiStorage } from '../storage/api'
import { mirrorThemeCookie } from '../storage/cookie-mirror'
import type { StorageBackend } from '../storage/types'
import { applyAnyTheme } from '../runtime/apply'
import { prepareStoredTheme } from '../runtime/load-theme'

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

interface InvarianceContextValue {
  config: InvarianceConfig
  apiKey: string
  userId: string
  appId: string
  themeStore: ThemeStore
  themeJson: AnyThemeJson | null
  initialTheme: AnyThemeJson | undefined
  registry: SlotRegistry
  storageBackend: StorageBackend
  componentLibrary: Record<string, React.ComponentType<any>> | undefined
  apiBaseUrl?: string
  onUsage?: UsageHandler
}

const InvarianceContext = createContext<InvarianceContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface InvarianceProviderProps {
  config: InvarianceConfig
  apiKey?: string
  userId?: string
  initialTheme?: AnyThemeJson
  componentLibrary?: Record<string, React.ComponentType<any>>
  storage?: 'memory' | 'localStorage' | 'api'
  storageUrl?: string
  apiBaseUrl?: string
  onUsage?: UsageHandler
  children: ReactNode
}

export function InvarianceProvider({
  config,
  apiKey = '',
  userId = '',
  initialTheme,
  componentLibrary,
  storage = 'memory',
  storageUrl,
  apiBaseUrl,
  onUsage,
  children,
}: InvarianceProviderProps) {
  const themeStore = useMemo(() => createThemeStore(), [])
  const registry = useMemo(() => createSlotRegistry(), [])

  const storageBackend = useMemo<StorageBackend>(() => {
    if (storage === 'localStorage') return createLocalStorage()
    if (storage === 'api') {
      if (!storageUrl) throw new Error('storageUrl is required when storage is "api"')
      return createApiStorage(storageUrl)
    }
    return createMemoryStorage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load theme.json from storage on mount, falling back to initialTheme.
  // prepareStoredTheme upgrades to v2 and re-runs the deterministic verifier —
  // stored bytes are untrusted (localStorage is user-editable; a remote backend
  // can drift). Verification failures are logged and the theme is silently
  // dropped so the app falls back to its own CSS defaults.
  useEffect(() => {
    let cancelled = false
    function applyPrepared(raw: AnyThemeJson): void {
      const prepared = prepareStoredTheme(raw, config)
      for (const w of prepared.warnings) console.warn('[invariance] theme upgrade:', w)
      if (!prepared.ok) {
        for (const f of prepared.failures) {
          console.warn('[invariance] stored theme failed verification; using base styling:', f)
        }
        return
      }
      themeStore.setTheme(prepared.theme)
      applyAnyTheme(prepared.theme, config)
      // Mirror to the cookie so the SSR helper can inline this theme on the next
      // request's first paint. Canonical store remains the storage backend.
      mirrorThemeCookie(config.app, prepared.theme)
    }
    async function loadTheme(): Promise<void> {
      try {
        const stored = await storageBackend.loadTheme(userId, config.app)
        if (cancelled) return
        const raw = stored ?? initialTheme ?? null
        if (raw) applyPrepared(raw)
      } catch (e) {
        console.warn('Failed to load theme.json:', e)
        if (!cancelled && initialTheme) applyPrepared(initialTheme)
      }
    }
    void loadTheme()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Subscribe to theme store changes
  const themeJson = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getSnapshot,
  )

  const value = useMemo<InvarianceContextValue>(
    () => ({
      config,
      apiKey,
      userId,
      appId: config.app,
      themeStore,
      themeJson,
      initialTheme,
      registry,
      storageBackend,
      componentLibrary,
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      ...(onUsage ? { onUsage } : {}),
    }),
    [config, apiKey, userId, themeStore, themeJson, initialTheme, registry, storageBackend, componentLibrary, apiBaseUrl, onUsage],
  )

  return (
    <InvarianceContext.Provider value={value}>
      {children}
    </InvarianceContext.Provider>
  )
}

export function useInvariance(): InvarianceContextValue {
  const ctx = useContext(InvarianceContext)
  if (!ctx) {
    throw new Error('useInvariance must be used inside <InvarianceProvider>')
  }
  return ctx
}
