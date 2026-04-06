import type { ThemeJson, InvarianceConfig } from '../config/types'
import type { SlotRegistration } from '../context/registry'
import type { TestResult } from '../verify/types'

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

export interface BuilderConfigResult {
  mutation: Partial<ThemeJson>
  explanation: string
}

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface BuilderConfigInput {
  currentThemeJson: ThemeJson | null
  intent: {
    slotName: string
    level: number
    description: string
    requirements: string[]
  }
  slotRegistry: SlotRegistration[]
  invariantConfig: InvarianceConfig
  retryFeedback?: TestResult[]
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
): Promise<BuilderConfigResult> {
  const systemPrompt = `You are the Builder agent for Invariance. You produce theme.json mutations (partial JSON) based on the Gatekeeper's intent.

CURRENT THEME.JSON:
${input.currentThemeJson ? JSON.stringify(input.currentThemeJson, null, 2) : '(empty — no customizations yet)'}

SLOT REGISTRY:
${JSON.stringify(input.slotRegistry.map((r) => ({ name: r.name, level: r.level, preserve: r.preserve })), null, 2)}

INVARIANT CONFIG:
${JSON.stringify(input.invariantConfig, null, 2)}

RULES:
1. Output ONLY valid JSON — a partial theme.json mutation object. No markdown fences, no commentary.
2. The mutation will be deep-merged into the current theme.json.
3. Slot names in theme.slots must match registered slot names.
4. Color values must be valid 6-digit hex (#RRGGBB).
5. Use camelCase CSS property names in slot overrides (e.g., backgroundColor, borderRight).
6. When the config has palette mode, use colors from the palette.
7. Do not add content/layout/component sections unless the intent level requires it.
8. Include an "explanation" field describing what was changed.

OUTPUT FORMAT:
{
  "mutation": { "theme": { "slots": { "sidebar": { "backgroundColor": "#1b2a4a" } } } },
  "explanation": "Changed sidebar background to dark blue"
}

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

  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })
  } catch {
    return { mutation: {}, explanation: 'Connection error. Please try again.' }
  }

  if (!response.ok) {
    return { mutation: {}, explanation: `API error (${response.status}). Please try again.` }
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    return { mutation: {}, explanation: 'Failed to parse API response.' }
  }

  let text: string | undefined
  try {
    const typed = data as { content: Array<{ type: string; text: string }> }
    text = typed.content.find((b) => b.type === 'text')?.text
  } catch {
    // fall through
  }

  if (!text) {
    return { mutation: {}, explanation: 'Builder returned empty response.' }
  }

  const parsed = extractJson(text) as { mutation?: Partial<ThemeJson>; explanation?: string } | undefined
  if (parsed && typeof parsed === 'object' && parsed.mutation) {
    return {
      mutation: parsed.mutation,
      explanation: parsed.explanation ?? input.intent.description,
    }
  }

  return { mutation: {}, explanation: 'Builder returned invalid output.' }
}
