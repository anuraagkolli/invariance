import type { ThemeJson, InvarianceConfig } from '../config/types'
import type { SlotRegistration } from '../context/registry'
import type { ThemeStore } from '../context/theme-store'
import type { StorageBackend } from '../storage/types'
import { callGatekeeper, type ConvTurn } from './gatekeeper'
import { callBuilder } from './builder'
import { verify } from '../verify/engine'
import { applyThemeJson } from '../runtime/apply'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PipelineResult =
  | { type: 'success'; description: string; slotName: string }
  | { type: 'clarification'; message: string }
  | { type: 'error'; message: string }

// ---------------------------------------------------------------------------
// Theme merge utility
// ---------------------------------------------------------------------------

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const sourceVal = source[key]
    const targetVal = target[key]
    if (
      sourceVal &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      )
    } else {
      result[key] = sourceVal
    }
  }
  return result
}

function mergeTheme(current: ThemeJson | null, mutation: Partial<ThemeJson>): ThemeJson {
  const base: ThemeJson = current ?? { version: 0, base_app_version: 'v1' }
  return deepMerge(base as unknown as Record<string, unknown>, mutation as unknown as Record<string, unknown>) as unknown as ThemeJson
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export type PipelineStage = 'gatekeeper' | 'builder' | 'verifying' | 'retry' | 'applying'

export async function runPipeline(
  userMessage: string,
  conversationHistory: ConvTurn[],
  context: {
    registry: SlotRegistration[]
    config: InvarianceConfig
    themeStore: ThemeStore
    storageBackend: StorageBackend
    apiKey: string
    userId: string
    appId: string
    componentLibrary?: string[]
  },
  onProgress?: (stage: PipelineStage) => void,
): Promise<PipelineResult> {
  const maxRetries = 2
  const componentLibrary = context.componentLibrary ?? []

  // Step 1: Gatekeeper — classify intent, validate level
  onProgress?.('gatekeeper')
  const gatekeeperResult = await callGatekeeper(
    {
      userMessage,
      conversationHistory,
      slotRegistry: context.registry,
      invariantConfig: context.config,
      componentLibrary,
    },
    context.apiKey,
  )

  if (gatekeeperResult.type === 'clarification' || gatekeeperResult.type === 'error') {
    return gatekeeperResult
  }

  const intent = gatekeeperResult

  // Step 2: Builder — produce theme.json mutation
  onProgress?.('builder')
  const currentTheme = context.themeStore.getTheme()

  let builderResult = await callBuilder(
    {
      currentThemeJson: currentTheme,
      intent,
      slotRegistry: context.registry,
      invariantConfig: context.config,
    },
    context.apiKey,
  )

  // Step 3: Merge + Verify (with retries to Builder on failure)
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const candidateTheme = mergeTheme(currentTheme, builderResult.mutation)
    candidateTheme.version = (currentTheme?.version ?? 0) + 1

    onProgress?.(attempt === 0 ? 'verifying' : 'retry')
    const verification = verify(
      candidateTheme,
      context.config,
      intent.level,
      context.registry,
      componentLibrary,
    )

    if (verification.passed) {
      // Step 4: Store + Apply
      onProgress?.('applying')
      await context.storageBackend.saveTheme(context.userId, context.appId, candidateTheme)
      context.themeStore.setTheme(candidateTheme)
      applyThemeJson(candidateTheme)
      return {
        type: 'success',
        description: builderResult.explanation,
        slotName: intent.slotName,
      }
    }

    if (attempt < maxRetries) {
      // Retry: send failures back to Builder (not Gatekeeper)
      builderResult = await callBuilder(
        {
          currentThemeJson: currentTheme,
          intent,
          slotRegistry: context.registry,
          invariantConfig: context.config,
          retryFeedback: verification.results.filter((r) => !r.passed),
        },
        context.apiKey,
      )
    }
  }

  return {
    type: 'error',
    message: 'Could not produce a valid change after multiple attempts. Try a simpler change.',
  }
}
