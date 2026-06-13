'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
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
import { reconcileStoredTheme } from '../runtime/reconcile-theme'
import { deriveConstraints } from '../config/derive-constraints'
import { canonicalStringify } from '../utils/canonical-json'
import { applyReconcileOutcome, type ReconcileEffects } from './apply-reconcile'

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
  llmProvider?: 'anthropic' | 'openai-compatible'
  oaiStructuredMode?: 'json_schema' | 'json_object'
  models?: { gatekeeper?: string; designer?: string; builder?: string; slotEdit?: string }
  // Last live reconcile outcome. Set when a config-constraint change forced a
  // recompile of the applied theme; null otherwise. The panel reads this to show
  // a "your theme was adjusted to honor new invariants" notice.
  lastReconcile: { action: 'recompiled'; reason: string } | null
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
  llmProvider?: 'anthropic' | 'openai-compatible'
  oaiStructuredMode?: 'json_schema' | 'json_object'
  models?: { gatekeeper?: string; designer?: string; builder?: string; slotEdit?: string }
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
  llmProvider,
  oaiStructuredMode,
  models,
  children,
}: InvarianceProviderProps) {
  const themeStore = useMemo(() => createThemeStore(), [])
  const registry = useMemo(() => createSlotRegistry(), [])

  // Last live reconcile outcome (config-constraint change forced a recompile).
  const [lastReconcile, setLastReconcile] = useState<{ action: 'recompiled'; reason: string } | null>(null)

  const storageBackend = useMemo<StorageBackend>(() => {
    if (storage === 'localStorage') return createLocalStorage()
    if (storage === 'api') {
      if (!storageUrl) throw new Error('storageUrl is required when storage is "api"')
      return createApiStorage(storageUrl)
    }
    return createMemoryStorage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Build the side-effects bag for the reconcile router. Constructed fresh inside
  // each effect body so it closes over the CURRENT config/userId — the effects
  // run at distinct times (mount load vs live constraint change) and we never
  // want a stale config captured at mount to drive a later live reconcile.
  const makeEffects = (): ReconcileEffects => ({
    setTheme: (t) => themeStore.setTheme(t),
    applyTheme: (t) => applyAnyTheme(t, config),
    // Mirror to the cookie so the SSR helper can inline this theme on the next
    // request's first paint. Canonical store remains the storage backend.
    mirrorCookie: (t) => mirrorThemeCookie(config.app, t),
    // Persist only fires for 'recompiled' so the invariant-honoring upgrade sticks
    // across reloads. Fire-and-forget: a persistence failure must not break the UI.
    persist: (t) => {
      void storageBackend
        .saveTheme(userId, config.app, t)
        .catch((e) => console.warn('[invariance] failed to persist recompiled theme:', e))
    },
    onRecompiled: (reason) => setLastReconcile({ action: 'recompiled', reason }),
    warn: (m) => console.warn(m),
  })

  // Load theme.json from storage on mount, falling back to initialTheme.
  // reconcileStoredTheme upgrades to v2 and re-runs the deterministic verifier —
  // stored bytes are untrusted (localStorage is user-editable; a remote backend
  // can drift) and the current invariant config may differ from the one the theme
  // was authored under. keep/recompiled apply; recompiled also persists + notifies;
  // a drop falls back to the app's own CSS defaults.
  useEffect(() => {
    let cancelled = false
    function applyReconciled(raw: AnyThemeJson): void {
      const result = reconcileStoredTheme(raw, config)
      applyReconcileOutcome(result, makeEffects())
    }
    async function loadTheme(): Promise<void> {
      try {
        const stored = await storageBackend.loadTheme(userId, config.app)
        if (cancelled) return
        const raw = stored ?? initialTheme ?? null
        if (raw) applyReconciled(raw)
      } catch (e) {
        console.warn('Failed to load theme.json:', e)
        if (!cancelled && initialTheme) applyReconciled(initialTheme)
      }
    }
    void loadTheme()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live re-verification: when the developer changes a design CONSTRAINT (locks a
  // brand accent, tightens contrast, restricts modes) the new config flows in as a
  // fresh prop, but the mount-load effect already ran. Re-reconcile the CURRENTLY-
  // applied theme against the new config so the vibe is kept while the new
  // invariants win — live, no reload. Keyed on a canonical hash of the DERIVED
  // constraints so it ignores unrelated config churn (e.g. page-level edits).
  const constraintsHash = useMemo(() => canonicalStringify(deriveConstraints(config)), [config])
  useEffect(() => {
    const current = themeStore.getTheme()
    if (!current) return // nothing applied yet (mount: async load hasn't run) — no-op
    const result = reconcileStoredTheme(current, config)
    applyReconcileOutcome(result, makeEffects())
    // Depend only on constraintsHash: a setTheme from a recompile changes themeJson
    // but NOT the derived constraints, so this never re-fires on its own output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [constraintsHash])

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
      lastReconcile,
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      ...(onUsage ? { onUsage } : {}),
      ...(llmProvider ? { llmProvider } : {}),
      ...(oaiStructuredMode ? { oaiStructuredMode } : {}),
      ...(models ? { models } : {}),
    }),
    [config, apiKey, userId, themeStore, themeJson, initialTheme, registry, storageBackend, componentLibrary, lastReconcile, apiBaseUrl, onUsage, llmProvider, oaiStructuredMode, models],
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
