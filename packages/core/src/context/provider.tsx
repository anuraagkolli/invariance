'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import type { InvarianceConfig, ThemeJson } from '../config/types'
import { createThemeStore, type ThemeStore } from './theme-store'
import { createSlotRegistry, type SlotRegistry } from './registry'
import { createMemoryStorage } from '../storage/memory'
import { createLocalStorage } from '../storage/local-storage'
import { createApiStorage } from '../storage/api'
import type { StorageBackend } from '../storage/types'
import { applyThemeJson } from '../runtime/apply'

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

interface InvarianceContextValue {
  config: InvarianceConfig
  apiKey: string
  userId: string
  appId: string
  themeStore: ThemeStore
  themeJson: ThemeJson | null
  registry: SlotRegistry
  storageBackend: StorageBackend
  componentLibrary: Record<string, React.ComponentType<any>> | undefined
}

const InvarianceContext = createContext<InvarianceContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface InvarianceProviderProps {
  config: InvarianceConfig
  apiKey?: string
  userId?: string
  initialTheme?: ThemeJson
  componentLibrary?: Record<string, React.ComponentType<any>>
  storage?: 'memory' | 'localStorage' | 'api'
  storageUrl?: string
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

  // Load theme.json from storage on mount, falling back to initialTheme
  useEffect(() => {
    let cancelled = false
    async function loadTheme(): Promise<void> {
      try {
        const stored = await storageBackend.loadTheme(userId, config.app)
        if (cancelled) return
        const theme = stored ?? initialTheme ?? null
        if (theme) {
          themeStore.setTheme(theme)
          applyThemeJson(theme)
        }
      } catch (e) {
        console.warn('Failed to load theme.json:', e)
        // Still try to apply initialTheme on storage failure
        if (!cancelled && initialTheme) {
          themeStore.setTheme(initialTheme)
          applyThemeJson(initialTheme)
        }
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
      registry,
      storageBackend,
      componentLibrary,
    }),
    [config, apiKey, userId, themeStore, themeJson, registry, storageBackend, componentLibrary],
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
