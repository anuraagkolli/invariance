import { StyleSpecSchema } from '../compiler/style-spec'
import type { StyleSpec, DesignConstraints } from '../compiler/style-spec'
import { FONT_PAIRINGS } from '../registries/font-pairings'
import { THEME_PACKS } from '../registries/theme-packs'
import { callClaude } from './api'
import type { UsageHandler } from './api'
import { DESIGNER_MODEL } from './models'
import { styleSpecWireSchema } from './wire-schemas'
import { buildDesignerPrompt, selectFewShotPacks } from './designer-prompt'

export interface DesignerInput {
  request: string
  currentSpec?: StyleSpec
  constraints: DesignConstraints
  apiKey: string
  fetchFn?: typeof fetch
  baseUrl?: string
  onUsage?: UsageHandler
}

export type DesignerResult =
  | { ok: true; spec: StyleSpec }
  | { ok: false; error: string; retryable: boolean }

// Calls the Designer LLM to produce a StyleSpec from a user's vibe request.
// retryFeedback carries zod issues or verify failures from a previous attempt;
// they are appended to the prompt so the model can self-correct.
export async function callDesigner(input: DesignerInput, retryFeedback?: string[]): Promise<DesignerResult> {
  // Restrict the fontPairing enum to the allowed registry subset when constraints say so.
  // Intersect with the real registry ids so a typo'd config id can never enter the wire
  // enum and cause the LLM to emit an unresolvable pairing id.
  const allIds = FONT_PAIRINGS.map((p) => p.id)
  const rawRegistry = input.constraints.font_registry
  let pairingIds: string[]
  if (rawRegistry) {
    pairingIds = rawRegistry.filter((id) => allIds.includes(id))
    // Empty intersection means the config has no valid ids — fail fast before the API call.
    if (pairingIds.length === 0) {
      return { ok: false, error: 'font_registry has no valid pairing ids', retryable: false }
    }
  } else {
    pairingIds = allIds
  }

  const system = buildDesignerPrompt({
    constraints: input.constraints,
    fewShot: selectFewShotPacks(input.request, THEME_PACKS, 3),
    ...(input.currentSpec ? { currentSpec: input.currentSpec } : {}),
  })

  const userContent = retryFeedback?.length
    ? `${input.request}\n\nYOUR PREVIOUS SPEC WAS REJECTED:\n${retryFeedback.map((f) => `- ${f}`).join('\n')}\nProduce a corrected StyleSpec.`
    : input.request

  const result = await callClaude({
    apiKey: input.apiKey, model: DESIGNER_MODEL, system,
    messages: [{ role: 'user', content: userContent }],
    temperature: 0.7, maxTokens: 2048,
    outputSchema: styleSpecWireSchema(pairingIds),
    ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
    ...(input.onUsage ? { onUsage: input.onUsage } : {}),
  })

  // Transport or HTTP failure — not retryable (the issue is not the model's output).
  if (!result.ok) return { ok: false, error: result.error, retryable: false }

  let raw: unknown
  try {
    raw = JSON.parse(result.text)
  } catch {
    return { ok: false, error: 'Designer returned unparseable JSON.', retryable: true }
  }

  // zod validates what the wire schema dialect cannot (e.g. accentHue 0-360).
  // Failures are retryable: we send the issue messages back as retryFeedback.
  const parsed = StyleSpecSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    return { ok: false, error: issues.join('; '), retryable: true }
  }

  // exactOptionalPropertyTypes: spread-strip undefined from optional fields so
  // zod's `undefined`-inclusive optional type matches StyleSpec's exact optional.
  const data = parsed.data
  const spec: StyleSpec = {
    mode: data.mode,
    accentHue: data.accentHue,
    accentChroma: data.accentChroma,
    neutralTint: data.neutralTint,
    neutralTintStrength: data.neutralTintStrength,
    contrast: data.contrast,
    fontPairing: data.fontPairing,
    radius: data.radius,
    shadow: data.shadow,
    density: data.density,
    borderWeight: data.borderWeight,
    rationale: data.rationale,
    ...(data.secondaryHue !== undefined ? { secondaryHue: data.secondaryHue } : {}),
  }
  return { ok: true, spec }
}
