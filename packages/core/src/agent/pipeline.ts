import type { AnyThemeJson, ThemeJson, InvarianceConfig } from '../config/types'
import type { SlotRegistration } from '../context/registry'
import type { ThemeStore } from '../context/theme-store'
import type { StorageBackend } from '../storage/types'
import { callGatekeeper, type ConvTurn } from './gatekeeper'
import { callBuilder } from './builder'
import { verify } from '../verify/engine'
import { applyAnyTheme } from '../runtime/apply'

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
    fetchFn?: typeof fetch
  },
  onProgress?: (stage: PipelineStage) => void,
): Promise<PipelineResult> {
  const maxRetries = 2
  const componentLibrary = context.componentLibrary ?? []

  // Step 1: Gatekeeper — classify intent, validate level
  onProgress?.('gatekeeper')
  const gatekeeperResult = await callGatekeeper(
    userMessage,
    conversationHistory,
    {
      registry: context.registry,
      config: context.config,
      apiKey: context.apiKey,
      componentLibrary,
      ...(context.fetchFn ? { fetchFn: context.fetchFn } : {}),
    },
  )

  // --- v6 kind routing shim ---
  // THEME: placeholder until Task 7 wires the Designer pipeline
  if (gatekeeperResult.kind === 'THEME') {
    return { type: 'error', message: 'Whole-app theming lands in the next task.' }
  }

  // Pass-through kinds that need no further processing
  if (gatekeeperResult.kind === 'CLARIFY') {
    return { type: 'clarification', message: gatekeeperResult.message }
  }
  if (gatekeeperResult.kind === 'REJECT' || gatekeeperResult.kind === 'ERROR') {
    return { type: 'error', message: gatekeeperResult.message }
  }

  // SLOT_F1 / F2 / F3 / F4: map to the intent shape the v5 Builder consumes
  const intent = {
    slotName: gatekeeperResult.slotName,
    level: gatekeeperResult.level,
    description: gatekeeperResult.description,
    requirements: gatekeeperResult.requirements,
  }

  // Step 2: Builder — produce theme.json mutation.
  // The v5 Builder path operates on v1-shaped themes; cast is safe here because
  // slot-level THEME routing (Task 7) will bypass this path entirely.
  onProgress?.('builder')
  const currentTheme = context.themeStore.getTheme()
  const currentThemeV1 = currentTheme as ThemeJson | null

  let builderResult = await callBuilder(
    {
      currentThemeJson: currentThemeV1,
      intent,
      slotRegistry: context.registry,
      invariantConfig: context.config,
    },
    context.apiKey,
  )

  // Step 3: Merge + Verify (with retries to Builder on failure)
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const candidateTheme = mergeTheme(currentThemeV1, builderResult.mutation)
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
      applyAnyTheme(candidateTheme, context.config)
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
          currentThemeJson: currentThemeV1,
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
