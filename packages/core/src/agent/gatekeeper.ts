import type { InvarianceConfig } from '../config/types'
import type { SlotRegistration } from '../context/registry'

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type GatekeeperResult =
  | {
      type: 'intent'
      slotName: string
      level: number
      description: string
      requirements: string[]
    }
  | {
      type: 'clarification'
      message: string
    }
  | {
      type: 'error'
      message: string
    }

export type ConvTurn = { role: 'user' | 'assistant'; content: string }

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  registry: SlotRegistration[],
  config: InvarianceConfig,
  componentLibrary: string[],
): string {
  return `You are the Gatekeeper agent for Invariance, a UI customization framework. You classify user intent, validate against slot levels, and produce structured intents for the Builder agent. You NEVER produce theme.json mutations or code.

AVAILABLE SLOTS:
<slots>
${JSON.stringify(registry, null, 2)}
</slots>

APP CONFIG:
<config>
${JSON.stringify(config, null, 2)}
</config>

COMPONENT LIBRARY (for F4 swaps):
${componentLibrary.length > 0 ? componentLibrary.join(', ') : 'None registered'}

LEVELS:
- Level 1 (F1): Style — colors, fonts, spacing, borders, radii, backgrounds, shadows, opacity
- Level 2 (F2): Content — text, labels, images, alt text
- Level 3 (F3): Layout — show/hide sections, reorder, resize
- Level 4 (F4): Components — swap components from approved library

A slot can only receive changes AT OR BELOW its assigned level. Slots with preserve=true cannot be hidden or removed.

RULES:
1. If the request is clear and maps to a specific slot: output an intent with specific requirements for the Builder
2. If the request affects multiple slots or is global: output an intent targeting the most relevant slot with global requirements
3. If ambiguous: ask ONE specific clarifying question
4. If not allowed (level too high, preserved slot): explain why in a friendly way
5. For colors: convert color names to hex values
6. Requirements must be specific enough for a Builder that produces theme.json mutations
7. Each requirement should be one concrete change (e.g., "set sidebar backgroundColor to #1b2a4a")
8. SLOT RESOLUTION: When a user mentions a UI area by name (e.g. "sidebar", "nav bar", "left panel"), match it against each slot's name, description, and aliases. Prefer the slot whose aliases or description best fit the user's wording AND that has cssVariables populated (style changes only work on slots that own CSS variables). If two slots are plausible, ask a clarifying question quoting both registered slot names. The slotName in your intent MUST be a canonical name from the registry — never an alias.

RESPONSE FORMAT — respond with ONLY valid JSON, no markdown fences:

Intent: {"type":"intent","slotName":"sidebar","level":1,"description":"Change sidebar background to dark blue","requirements":["Set theme.slots.sidebar.backgroundColor to #1b2a4a","Set theme.slots.sidebar.borderRight to 2px solid #e94560"]}

Clarification: {"type":"clarification","message":"I can change the sidebar, header, dashboard cards, or footer. Which area would you like to update?"}

Error: {"type":"error","message":"The sidebar is marked as preserved and cannot be hidden. I can help you restyle it instead."}`
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

export interface GatekeeperInput {
  userMessage: string
  conversationHistory: ConvTurn[]
  slotRegistry: SlotRegistration[]
  invariantConfig: InvarianceConfig
  componentLibrary: string[]
}

export async function callGatekeeper(
  input: GatekeeperInput,
  apiKey: string,
): Promise<GatekeeperResult> {
  if (!apiKey) {
    return {
      type: 'error',
      message: 'Customization requires an API key. Contact the app developer to enable this feature.',
    }
  }

  const systemPrompt = buildSystemPrompt(
    input.slotRegistry,
    input.invariantConfig,
    input.componentLibrary,
  )
  const messages: ConvTurn[] = [
    ...input.conversationHistory,
    { role: 'user', content: input.userMessage },
  ]

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
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        temperature: 0.2,
        system: systemPrompt,
        messages,
      }),
    })
  } catch {
    return { type: 'error', message: 'Connection error. Please try again.' }
  }

  if (!response.ok) {
    return { type: 'error', message: 'Connection error. Please try again.' }
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    return { type: 'error', message: 'Something went wrong. Try rephrasing your request.' }
  }

  let text: string | undefined
  try {
    const typed = data as { content: Array<{ type: string; text: string }> }
    text = typed.content.find((b) => b.type === 'text')?.text
  } catch {
    return { type: 'error', message: 'Something went wrong. Try rephrasing your request.' }
  }

  if (!text) {
    return { type: 'error', message: 'Something went wrong. Try rephrasing your request.' }
  }

  const parsed = extractJson(text) as GatekeeperResult | undefined
  if (
    parsed &&
    typeof parsed === 'object' &&
    'type' in parsed &&
    (parsed.type === 'intent' || parsed.type === 'clarification' || parsed.type === 'error')
  ) {
    return parsed
  }

  return { type: 'error', message: 'Something went wrong. Try rephrasing your request.' }
}
