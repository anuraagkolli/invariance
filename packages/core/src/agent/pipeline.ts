import type { AnyThemeJson, ThemeJson, ThemeJsonV2, InvarianceConfig } from '../config/types'
import type { SlotRegistration } from '../context/registry'
import type { ThemeStore } from '../context/theme-store'
import type { StorageBackend } from '../storage/types'
import { callGatekeeper, type ConvTurn } from './gatekeeper'
import { callBuilder, type SectionsMutation } from './builder'
import { callDesigner } from './designer'
import { runSlotEdit } from './slot-edit'
import { compileTheme, InvalidStyleSpecError } from '../compiler/compile'
import { upgradeThemeJson } from '../config/upgrade'
import { ThemeJsonV2Schema } from '../config/schema'
import { verify } from '../verify/engine'
import { verifyV2 } from '../verify/compiled-tests'
import { deriveConstraints } from '../config/derive-constraints'
import { applyAnyTheme } from '../runtime/apply'
import { mirrorThemeCookie } from '../storage/cookie-mirror'
import type { UsageHandler } from './api'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PipelineResult =
  | { type: 'success'; description: string; slotName: string; warnings?: string[] }
  | { type: 'clarification'; message: string }
  | { type: 'error'; message: string }

// 'designer'/'compiling' belong to the THEME route; 'slot-edit' to SLOT_F1;
// 'builder' to F2/F3/F4.
export type PipelineStage = 'gatekeeper' | 'designer' | 'compiling' | 'slot-edit' | 'builder' | 'verifying' | 'retry' | 'applying'

export interface PipelineContext {
  registry: SlotRegistration[]
  config: InvarianceConfig
  themeStore: ThemeStore
  storageBackend: StorageBackend
  apiKey: string
  userId: string
  appId: string
  componentLibrary?: string[]
  fetchFn?: typeof fetch
  apiBaseUrl?: string
  onUsage?: UsageHandler
}

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

// ---------------------------------------------------------------------------
// v2-native helpers
// ---------------------------------------------------------------------------

// Every route operates on v2: stored v1 (or nothing) upgrades exactly once here.
async function loadCurrentV2(context: PipelineContext): Promise<ThemeJsonV2> {
  const stored: AnyThemeJson | null =
    context.themeStore.getTheme() ??
    await context.storageBackend.loadTheme(context.userId, context.appId)
  const { theme } = upgradeThemeJson(stored ?? { version: 1, base_app_version: 'v1' })
  return theme
}

async function persistAndApply(context: PipelineContext, candidate: ThemeJsonV2): Promise<void> {
  await context.storageBackend.saveTheme(context.userId, context.appId, candidate)
  context.themeStore.setTheme(candidate)
  applyAnyTheme(candidate, context.config)
  // Mirror the just-applied theme to the cookie so the next SSR request paints
  // it on first byte. The storage backend above stays the source of truth.
  mirrorThemeCookie(context.appId, candidate)
}

// Builder mutations only carry the page-keyed sections; theme.* is owned by
// the THEME and SLOT_F1 routes and passes through verbatim.
function mergeSectionsIntoV2(current: ThemeJsonV2, mutation: SectionsMutation): ThemeJsonV2 {
  const candidate: ThemeJsonV2 = {
    version: 2,
    base_app_version: current.base_app_version,
    ...(current.theme !== undefined ? { theme: current.theme } : {}),
  }
  const merged = <T>(cur: T | undefined, mut: T | undefined): T | undefined => {
    if (mut === undefined) return cur
    return deepMerge((cur ?? {}) as Record<string, unknown>, mut as Record<string, unknown>) as unknown as T
  }
  const content = merged(current.content, mutation.content)
  if (content !== undefined) candidate.content = content
  const layout = merged(current.layout, mutation.layout)
  if (layout !== undefined) candidate.layout = layout
  const components = merged(current.components, mutation.components)
  if (components !== undefined) candidate.components = components
  return candidate
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function runPipeline(
  userMessage: string,
  conversationHistory: ConvTurn[],
  context: PipelineContext,
  onProgress?: (stage: PipelineStage) => void,
): Promise<PipelineResult> {
  const maxRetries = 2
  const componentLibrary = context.componentLibrary ?? []

  // Shared transport hooks for every agent call (test fetch / hosted endpoint / metering).
  const agentOpts = {
    ...(context.fetchFn ? { fetchFn: context.fetchFn } : {}),
    ...(context.apiBaseUrl ? { baseUrl: context.apiBaseUrl } : {}),
    ...(context.onUsage ? { onUsage: context.onUsage } : {}),
  }

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
      ...agentOpts,
    },
  )

  // --- THEME route: Designer → compileTheme → verifyV2 → store + apply ---
  if (gatekeeperResult.kind === 'THEME') {
    const constraints = deriveConstraints(context.config)
    const currentV2 = await loadCurrentV2(context)

    // Read the current styleSpec for "more X" relativity in the Designer prompt.
    const currentSpec = currentV2.theme?.styleSpec

    // Designer retry loop — budget: 1 initial + 2 retries (shared by spec-invalid
    // and verify-fail). Non-retryable failures (transport) abort immediately.
    const MAX_RETRIES = 2
    let retryFeedback: string[] | undefined
    let lastError = 'Could not produce a valid theme after multiple attempts. Try a simpler request.'

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      onProgress?.(attempt === 0 ? 'designer' : 'retry')

      const designerResult = await callDesigner(
        {
          request: userMessage,
          // exactOptionalPropertyTypes: only spread currentSpec when present so
          // undefined is never assigned to an optional field explicitly.
          ...(currentSpec !== undefined ? { currentSpec } : {}),
          constraints,
          apiKey: context.apiKey,
          ...agentOpts,
        },
        retryFeedback,
      )

      // Non-retryable failure (transport / HTTP / refusal / truncation).
      if (!designerResult.ok) {
        if (!designerResult.retryable) {
          return { type: 'error', message: designerResult.error }
        }
        // Retryable (zod issues); feed them back and continue.
        retryFeedback = [designerResult.error]
        lastError = designerResult.error
        continue
      }

      const spec = designerResult.spec

      // Compile — InvalidStyleSpecError = retryable constraint violation.
      onProgress?.('compiling')
      let compiled: ReturnType<typeof compileTheme>
      try {
        compiled = compileTheme(spec, constraints)
      } catch (err) {
        if (err instanceof InvalidStyleSpecError) {
          retryFeedback = err.issues
          lastError = err.issues.join('; ')
          continue
        }
        // Plain Error = compiler invariant violated (never from user input).
        throw err
      }

      // Build the v2 candidate: carry existing slots (user precision edits) + new
      // compiler roles on top; preserve content/layout/components sections.
      const candidate: ThemeJsonV2 = {
        version: 2,
        base_app_version: currentV2.base_app_version,
        theme: {
          roles: compiled.roles,
          // Preserve any slot overrides the user added; they layer over roles on :root.
          slots: { ...(currentV2.theme?.slots ?? {}) },
          styleSpec: spec,
        },
      }
      if (currentV2.content !== undefined) candidate.content = currentV2.content
      if (currentV2.layout !== undefined) candidate.layout = currentV2.layout
      if (currentV2.components !== undefined) candidate.components = currentV2.components

      // Verify — failures are retryable via the Designer (same budget).
      onProgress?.('verifying')
      const verification = verifyV2(candidate, context.config, constraints)
      if (!verification.passed) {
        const failMessages = verification.results
          .filter((r) => !r.passed)
          .map((r) => `${r.name}: ${r.message}`)
        retryFeedback = failMessages
        lastError = failMessages.join('; ')
        continue
      }

      // Final invariant: ThemeJsonV2Schema must accept the candidate.
      // A failure here is a compiler bug (programmer error), not user input.
      const schemaCheck = ThemeJsonV2Schema.safeParse(candidate)
      if (!schemaCheck.success) {
        throw new Error(
          `compiler produced an invalid v2 doc: ${schemaCheck.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        )
      }

      // Store + apply.
      onProgress?.('applying')
      await persistAndApply(context, candidate)

      // Only include warnings when non-empty (exactOptionalPropertyTypes: never assign
      // undefined to an optional field explicitly).
      return {
        type: 'success',
        description: spec.rationale,
        slotName: 'theme',
        ...(compiled.warnings.length > 0 ? { warnings: compiled.warnings } : {}),
      }
    }

    return { type: 'error', message: lastError }
  }

  // Pass-through kinds that need no further processing
  if (gatekeeperResult.kind === 'CLARIFY') {
    return { type: 'clarification', message: gatekeeperResult.message }
  }
  if (gatekeeperResult.kind === 'REJECT' || gatekeeperResult.kind === 'ERROR') {
    return { type: 'error', message: gatekeeperResult.message }
  }

  // --- SLOT_F1 route: constrained value pick + contrast solve (no Designer) ---
  if (gatekeeperResult.kind === 'SLOT_F1') {
    onProgress?.('slot-edit')
    const constraints = deriveConstraints(context.config)
    const currentV2 = await loadCurrentV2(context)
    const outcome = await runSlotEdit({
      intent: { slotName: gatekeeperResult.slotName, description: gatekeeperResult.description },
      currentV2,
      registry: context.registry,
      constraints,
      config: context.config,
      apiKey: context.apiKey,
      ...agentOpts,
    })
    if (!outcome.ok) return { type: 'error', message: outcome.error }
    onProgress?.('applying')
    await persistAndApply(context, outcome.candidate)
    return { type: 'success', description: outcome.explanation, slotName: gatekeeperResult.slotName }
  }

  // --- F2 / F3 / F4 route: Builder produces page-keyed sections only ---
  const intent = {
    slotName: gatekeeperResult.slotName,
    level: gatekeeperResult.level,
    description: gatekeeperResult.description,
    requirements: gatekeeperResult.requirements,
  }

  onProgress?.('builder')
  const currentV2 = await loadCurrentV2(context)
  const builderInput = {
    currentTheme: currentV2,
    intent,
    slotRegistry: context.registry,
    invariantConfig: context.config,
    ...agentOpts,
  }
  let builderResult = await callBuilder(builderInput, context.apiKey)

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    onProgress?.(attempt === 0 ? 'verifying' : 'retry')
    if (!builderResult.ok) return { type: 'error', message: builderResult.error }

    const candidate = mergeSectionsIntoV2(currentV2, builderResult.mutation)
    // The v5 engine verifies the page-keyed sections; their shapes are shared
    // between v1 and v2, so the cast is sound.
    const verification = verify(candidate as unknown as ThemeJson, context.config, intent.level, context.registry, componentLibrary)

    if (verification.passed) {
      onProgress?.('applying')
      await persistAndApply(context, candidate)
      return { type: 'success', description: builderResult.explanation, slotName: intent.slotName }
    }

    if (attempt < maxRetries) {
      builderResult = await callBuilder({ ...builderInput, retryFeedback: verification.results.filter((r) => !r.passed) }, context.apiKey)
    }
  }

  return {
    type: 'error',
    message: 'Could not produce a valid change after multiple attempts. Try a simpler change.',
  }
}
