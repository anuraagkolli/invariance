import type { AnyThemeJson, ThemeJson, ThemeJsonV2, InvarianceConfig, ContentSection, LayoutSection, ComponentsSection } from '../config/types'
import { isV2Theme } from '../config/types'
import type { SlotRegistration } from '../context/registry'
import type { ThemeStore } from '../context/theme-store'
import type { StorageBackend } from '../storage/types'
import { callGatekeeper, type ConvTurn } from './gatekeeper'
import { callBuilder } from './builder'
import { callDesigner } from './designer'
import { compileTheme, InvalidStyleSpecError } from '../compiler/compile'
import { upgradeThemeJson } from '../config/upgrade'
import { ThemeJsonV2Schema } from '../config/schema'
import { verify } from '../verify/engine'
import { verifyV2 } from '../verify/compiled-tests'
import { deriveConstraints } from '../config/derive-constraints'
import { applyThemeJson, applyAnyTheme } from '../runtime/apply'

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
// v2 mutation translation
//
// The Builder always emits v1-shaped mutations (theme.globals for CSS vars).
// When the current stored theme is already v2 (upgraded by the provider), we
// must translate before merging: --inv-* entries in globals move to slots.
// The v1 inline-style fallback path (theme.slots keyed by slot name with
// style objects) has no v2 home — surface an error instead of silently
// dropping the values.
//
// NOTE: this translation bridge is temporary. Phase 4's slot-edit
// micro-mutation path will have the Builder emit v2-native mutations directly,
// at which point this function can be deleted.
// ---------------------------------------------------------------------------

interface V1Mutation extends Partial<ThemeJson> {
  theme?: {
    globals?: Record<string, string>
    slots?: Record<string, Record<string, string>>
  }
}

function translateMutationToV2(
  mutation: Partial<ThemeJson>,
  currentV2: ThemeJsonV2,
): { translated: ThemeJsonV2; touchedSlots: boolean } | { error: string } {
  const m = mutation as V1Mutation

  // Detect v1 inline-style slot fallback: slots keyed by slot name (not CSS vars)
  if (m.theme?.slots) {
    const slotKeys = Object.keys(m.theme.slots)
    const hasInlineStyleSlots = slotKeys.some((k) => !k.startsWith('--'))
    if (hasInlineStyleSlots) {
      return {
        error: 'This slot does not support style variables yet.',
      }
    }
  }

  // Translate globals → slots. The v2 theme.slots map uses the same --inv-* keys.
  const newSlotEntries: Record<string, string> = {}
  let touchedSlots = false

  if (m.theme?.globals) {
    for (const [key, value] of Object.entries(m.theme.globals)) {
      if (typeof value === 'string') {
        newSlotEntries[key] = value
        touchedSlots = true
      }
    }
  }

  // Build the translated v2 document by merging onto the current v2 theme.
  const mergedSlots = { ...(currentV2.theme?.slots ?? {}), ...newSlotEntries }
  const translated: ThemeJsonV2 = {
    // Keep version as literal 2 (schema literal — NOT incremented; v2 version is
    // a schema version, not a per-save revision counter like v1 used it).
    version: 2,
    base_app_version: currentV2.base_app_version,
    theme: {
      roles: { ...(currentV2.theme?.roles ?? {}) },
      slots: mergedSlots,
      ...(currentV2.theme?.styleSpec ? { styleSpec: currentV2.theme.styleSpec } : {}),
    },
  }

  // content/layout/components sections are shape-shared between v1 and v2;
  // merge them directly from the original mutation.
  // Use unknown as intermediate to satisfy exactOptionalPropertyTypes: the
  // deepMerge result is structurally correct but typed as Record<string,unknown>.
  const contentMutation = mutation.content
  const layoutMutation = mutation.layout
  const componentsMutation = mutation.components

  if (contentMutation !== undefined) {
    translated.content = deepMerge(
      (currentV2.content ?? {}) as Record<string, unknown>,
      contentMutation as unknown as Record<string, unknown>,
    ) as unknown as ContentSection
  } else if (currentV2.content !== undefined) {
    translated.content = currentV2.content
  }
  if (layoutMutation !== undefined) {
    translated.layout = deepMerge(
      (currentV2.layout ?? {}) as Record<string, unknown>,
      layoutMutation as unknown as Record<string, unknown>,
    ) as unknown as LayoutSection
  } else if (currentV2.layout !== undefined) {
    translated.layout = currentV2.layout
  }
  if (componentsMutation !== undefined) {
    translated.components = deepMerge(
      (currentV2.components ?? {}) as Record<string, unknown>,
      componentsMutation as unknown as Record<string, unknown>,
    ) as unknown as ComponentsSection
  } else if (currentV2.components !== undefined) {
    translated.components = currentV2.components
  }

  return { translated, touchedSlots }
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

// 'designer' and 'compiling' added for the THEME route
export type PipelineStage = 'gatekeeper' | 'designer' | 'compiling' | 'builder' | 'verifying' | 'retry' | 'applying'

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

  // --- THEME route: Designer → compileTheme → verifyV2 → store + apply ---
  if (gatekeeperResult.kind === 'THEME') {
    const constraints = deriveConstraints(context.config)

    // Load the current theme; prefer the in-memory store (already upgraded by
    // the provider on load) then fall back to the storage backend.
    const storedRaw: AnyThemeJson | null =
      context.themeStore.getTheme() ??
      await context.storageBackend.loadTheme(context.userId, context.appId)

    // Upgrade v1 → v2 so the rest of the THEME path only handles v2 shapes.
    const { theme: currentV2 } = upgradeThemeJson(storedRaw ?? { version: 1, base_app_version: 'v1' })

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
          ...(context.fetchFn ? { fetchFn: context.fetchFn } : {}),
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
      await context.storageBackend.saveTheme(context.userId, context.appId, candidate)
      context.themeStore.setTheme(candidate)
      applyAnyTheme(candidate, context.config)

      return {
        type: 'success',
        description: spec.rationale,
        slotName: 'theme',
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

  // SLOT_F1 / F2 / F3 / F4: map to the intent shape the v5 Builder consumes
  const intent = {
    slotName: gatekeeperResult.slotName,
    level: gatekeeperResult.level,
    description: gatekeeperResult.description,
    requirements: gatekeeperResult.requirements,
  }

  // Step 2: Builder — produce theme.json mutation.
  onProgress?.('builder')
  const currentTheme: AnyThemeJson | null = context.themeStore.getTheme()
  const themeIsV2 = currentTheme !== null && isV2Theme(currentTheme)

  // Builder always receives a v1-shaped theme view (it emits v1-shaped mutations).
  // When the stored theme is v2, pass null so the Builder starts fresh rather than
  // consuming an incompatible shape.
  const currentThemeV1 = themeIsV2 ? null : (currentTheme as ThemeJson | null)

  let builderResult = await callBuilder(
    {
      currentThemeJson: currentThemeV1,
      intent,
      slotRegistry: context.registry,
      invariantConfig: context.config,
      ...(context.fetchFn ? { fetchFn: context.fetchFn } : {}),
    },
    context.apiKey,
  )

  // Step 3: Merge + Verify (with retries to Builder on failure)
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    onProgress?.(attempt === 0 ? 'verifying' : 'retry')

    if (themeIsV2) {
      // --- v2 path ---
      // Translate the Builder's v1-shaped mutation into v2 before merging.
      const translationResult = translateMutationToV2(builderResult.mutation, currentTheme as ThemeJsonV2)
      if ('error' in translationResult) {
        return { type: 'error', message: translationResult.error }
      }
      const { translated: candidateV2, touchedSlots } = translationResult

      // Run v5 verify for F2/F3/F4 (content/layout/components are shape-shared).
      // Also run verifyV2 when the mutation touched theme slots (CSS var changes).
      // Cast to ThemeJson for the v5 verify engine which only inspects content/
      // layout/components sections (same shape in v1 and v2).
      const v5Verification = verify(
        candidateV2 as unknown as ThemeJson,
        context.config,
        intent.level,
        context.registry,
        componentLibrary,
      )

      const v2Verification = touchedSlots
        ? verifyV2(candidateV2, context.config, deriveConstraints(context.config))
        : { passed: true, results: [] }

      const allPassed = v5Verification.passed && v2Verification.passed

      if (allPassed) {
        // Step 4 (v2 path): Store + Apply
        onProgress?.('applying')
        await context.storageBackend.saveTheme(context.userId, context.appId, candidateV2)
        context.themeStore.setTheme(candidateV2)
        applyAnyTheme(candidateV2, context.config)
        return {
          type: 'success',
          description: builderResult.explanation,
          slotName: intent.slotName,
        }
      }

      if (attempt < maxRetries) {
        const failedResults = [
          ...v5Verification.results.filter((r) => !r.passed),
          ...v2Verification.results.filter((r) => !r.passed),
        ]
        builderResult = await callBuilder(
          {
            currentThemeJson: currentThemeV1,
            intent,
            slotRegistry: context.registry,
            invariantConfig: context.config,
            retryFeedback: failedResults,
            ...(context.fetchFn ? { fetchFn: context.fetchFn } : {}),
          },
          context.apiKey,
        )
      }
    } else {
      // --- v1 path (exact v5 behavior preserved) ---
      // mergeTheme produces a v1 ThemeJson. We increment version as a per-save
      // revision counter (v5 convention). We call applyThemeJson directly —
      // NOT applyAnyTheme — so that a v5 revision counter at >= 2 can never
      // misclassify as v2 inside applyAnyTheme's isV2Theme check.
      const candidateTheme = mergeTheme(currentThemeV1, builderResult.mutation)
      candidateTheme.version = (currentTheme?.version ?? 0) + 1

      const verification = verify(
        candidateTheme,
        context.config,
        intent.level,
        context.registry,
        componentLibrary,
      )

      if (verification.passed) {
        // Step 4 (v1 path): Store + Apply
        onProgress?.('applying')
        await context.storageBackend.saveTheme(context.userId, context.appId, candidateTheme)
        context.themeStore.setTheme(candidateTheme)
        // Use applyThemeJson directly (not applyAnyTheme) to ensure a v5 revision
        // counter >= 2 never trips the v2 dispatch path in applyAnyTheme.
        applyThemeJson(candidateTheme, context.config)
        return {
          type: 'success',
          description: builderResult.explanation,
          slotName: intent.slotName,
        }
      }

      if (attempt < maxRetries) {
        builderResult = await callBuilder(
          {
            currentThemeJson: currentThemeV1,
            intent,
            slotRegistry: context.registry,
            invariantConfig: context.config,
            retryFeedback: verification.results.filter((r) => !r.passed),
            ...(context.fetchFn ? { fetchFn: context.fetchFn } : {}),
          },
          context.apiKey,
        )
      }
    }
  }

  return {
    type: 'error',
    message: 'Could not produce a valid change after multiple attempts. Try a simpler change.',
  }
}
