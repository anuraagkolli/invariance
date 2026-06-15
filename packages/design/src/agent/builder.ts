import type { ThemeJsonV2, InvarianceConfig, ContentSection, LayoutSection, ComponentsSection } from '../config/types'
import type { SlotRegistration } from '../context/registry'
import type { TestResult } from '../verify/types'
import { callClaude, type UsageHandler } from './api'
import { BUILDER_MODEL } from './models'

// ---------------------------------------------------------------------------
// Mutation + outcome types
//
// F2/F3/F4 only: the Builder never touches theme.* — the THEME route owns
// roles, SLOT_F1 owns slot literals. Mutations are the page-keyed sections.
// ---------------------------------------------------------------------------

export interface SectionsMutation {
  content?: ContentSection
  layout?: LayoutSection
  components?: ComponentsSection
}

export type BuilderOutcome =
  | { ok: true; mutation: SectionsMutation; explanation: string }
  | { ok: false; error: string }

export interface BuilderConfigInput {
  currentTheme: ThemeJsonV2 | null
  intent: {
    slotName: string
    level: number
    description: string
    requirements: string[]
  }
  slotRegistry: SlotRegistration[]
  invariantConfig: InvarianceConfig
  retryFeedback?: TestResult[]
  // injectable transport hooks (keyless tests / hosted endpoints / metering)
  fetchFn?: typeof fetch
  baseUrl?: string
  onUsage?: UsageHandler
  provider?: 'anthropic' | 'openai-compatible'
  oaiStructuredMode?: 'json_schema' | 'json_object'
  model?: string
}

// ---------------------------------------------------------------------------
// JSON extraction helper
// ---------------------------------------------------------------------------

function extractJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text.trim())
  } catch {
    const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
    if (fenceMatch?.[1]) {
      try {
        return JSON.parse(fenceMatch[1].trim())
      } catch {
        // fall through
      }
    }
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function callBuilder(
  input: BuilderConfigInput,
  apiKey: string,
): Promise<BuilderOutcome> {
  const systemPrompt = `You are the Builder agent for Invariance. You produce theme.json mutations (partial JSON) for content, layout, and component changes based on the Gatekeeper's intent.

CURRENT THEME.JSON:
${input.currentTheme ? JSON.stringify(input.currentTheme, null, 2) : '(empty — no customizations yet)'}

SLOT REGISTRY:
${JSON.stringify(
  input.slotRegistry.map((r) => ({
    name: r.name,
    level: r.level,
    preserve: r.preserve,
  })),
  null,
  2,
)}

INVARIANT CONFIG:
${JSON.stringify(input.invariantConfig, null, 2)}

RULES:
1. Output ONLY valid JSON — an object with a "mutation" object and an "explanation" string. No markdown fences, no commentary.
2. The mutation may contain ONLY "content", "layout", and/or "components" keys. Style changes (colors, fonts, radii) are handled by a different pipeline — NEVER emit a "theme" key.
3. The mutation will be deep-merged into the current theme.json — include only what changes.
4. Slot and section names must match registered slot names.
5. Do not exceed the intent's level.

For content changes (F2):
{
  "mutation": { "content": { "pages": { "/dashboard": { "el_003": { "text": "New Title" } } } } },
  "explanation": "Updated title text"
}

For layout changes (F3):
{
  "mutation": { "layout": { "pages": { "/dashboard": { "hidden": ["announcements-banner"] } } } },
  "explanation": "Hidden the announcements banner"
}

For component swaps (F4):
{
  "mutation": { "components": { "pages": { "/dashboard": { "chart-area": { "component": "LineChart", "props": { "showGrid": true } } } } } },
  "explanation": "Swapped bar chart for line chart"
}`

  const retrySection = input.retryFeedback
    ? `\n\nPREVIOUS ATTEMPT FAILED VERIFICATION. Fix these issues:\n${input.retryFeedback.map((r) => `- ${r.name}: ${r.message}${r.suggestedFix ? ` (fix: ${r.suggestedFix})` : ''}`).join('\n')}`
    : ''

  const userMessage = `INTENT:
${input.intent.description}

REQUIREMENTS:
${input.intent.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}
${retrySection}

Produce the theme.json mutation now:`

  // No outputSchema: the structured-outputs dialect requires additionalProperties:
  // false on every object, and these sections are map-shaped (dynamic page and
  // element keys) — inexpressible. Prompt-and-parse stays until the render-driven
  // phase retypes mutations as typed op arrays.
  const result = await callClaude({
    apiKey,
    model: input.model ?? BUILDER_MODEL,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    temperature: 0.2,
    maxTokens: 4096,
    ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
    ...(input.onUsage ? { onUsage: input.onUsage } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.oaiStructuredMode ? { oaiStructuredMode: input.oaiStructuredMode } : {}),
  })
  if (!result.ok) return { ok: false, error: result.error }

  const parsed = extractJson(result.text) as { mutation?: Record<string, unknown>; explanation?: string } | undefined
  if (!parsed || typeof parsed !== 'object' || !parsed.mutation || typeof parsed.mutation !== 'object') {
    return { ok: false, error: 'Could not produce a valid change. Please try again.' }
  }

  // Defense in depth: keep ONLY the three sections the Builder owns. A confused
  // model that emits a "theme" key (style territory) has it dropped here.
  const mutation: SectionsMutation = {}
  if (parsed.mutation.content !== undefined) mutation.content = parsed.mutation.content as ContentSection
  if (parsed.mutation.layout !== undefined) mutation.layout = parsed.mutation.layout as LayoutSection
  if (parsed.mutation.components !== undefined) mutation.components = parsed.mutation.components as ComponentsSection
  return { ok: true, mutation, explanation: parsed.explanation ?? input.intent.description }
}
