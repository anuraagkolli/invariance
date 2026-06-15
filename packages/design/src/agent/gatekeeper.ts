import { z } from 'zod'
import type { InvarianceConfig } from '../config/types'
import type { SlotRegistration } from '../context/registry'
import { callClaude } from './api'
import type { UsageHandler } from './api'
import { GATEKEEPER_MODEL } from './models'
import { GATEKEEPER_WIRE_SCHEMA } from './wire-schemas'
import { buildGatekeeperPrompt } from './gatekeeper-prompt'

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type GateKind = 'THEME' | 'SLOT_F1' | 'F2' | 'F3' | 'F4' | 'CLARIFY' | 'REJECT'

export type GatekeeperResult =
  | { kind: 'THEME'; description: string }
  | { kind: 'SLOT_F1' | 'F2' | 'F3' | 'F4'; slotName: string; level: number; description: string; requirements: string[] }
  | { kind: 'CLARIFY'; message: string }
  | { kind: 'REJECT'; message: string }
  | { kind: 'ERROR'; message: string }   // transport-level, never model-produced

export type ConvTurn = { role: 'user' | 'assistant'; content: string }

// ---------------------------------------------------------------------------
// Zod schema for the model's reply — per-kind superRefine enforces required
// fields that the wire dialect cannot express with numeric bounds.
// ---------------------------------------------------------------------------

const SLOT_KINDS = ['SLOT_F1', 'F2', 'F3', 'F4'] as const

const ModelReplySchema = z.object({
  kind: z.enum(['THEME', 'SLOT_F1', 'F2', 'F3', 'F4', 'CLARIFY', 'REJECT']),
  slotName: z.string().optional(),
  level: z.number().int().optional(),
  description: z.string().optional(),
  requirements: z.array(z.string()).optional(),
  message: z.string().optional(),
}).superRefine((val, ctx) => {
  if (val.kind === 'THEME') {
    if (!val.description) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'THEME requires description', path: ['description'] })
    }
  } else if ((SLOT_KINDS as readonly string[]).includes(val.kind)) {
    if (!val.slotName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Slot kind requires slotName', path: ['slotName'] })
    }
    if (val.level === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Slot kind requires level', path: ['level'] })
    }
    if (!val.description) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Slot kind requires description', path: ['description'] })
    }
  } else if (val.kind === 'CLARIFY' || val.kind === 'REJECT') {
    if (!val.message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${val.kind} requires message`, path: ['message'] })
    }
  }
})

// ---------------------------------------------------------------------------
// Level gates — enforced deterministically here, never trust the model for
// permissions. THEME requires at least one page with level >= 1; slot kinds
// require the kind's implied level to fit BOTH the slot's assigned level and
// the slot's page level. The model is told all of this in the prompt, but a
// weak model can ignore it (observed live: qwen applied a SLOT_F1 edit while
// every page was locked at level 0) — the prompt is guidance, this is the law.
// ---------------------------------------------------------------------------

function isThemeAllowed(config: InvarianceConfig): boolean {
  const pages = config.frontend?.pages
  if (!pages) return false
  return Object.values(pages).some((p) => typeof p === 'object' && p !== null && (p as { level?: number }).level !== undefined && (p as { level: number }).level >= 1)
}

// The level a kind NEEDS, by definition — independent of the model's `level` claim.
const KIND_LEVEL: Record<'SLOT_F1' | 'F2' | 'F3' | 'F4', number> = {
  SLOT_F1: 1,
  F2: 2,
  F3: 3,
  F4: 4,
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export interface GatekeeperOptions {
  registry: SlotRegistration[]
  config: InvarianceConfig
  apiKey: string
  componentLibrary?: string[]
  fetchFn?: typeof fetch
  baseUrl?: string
  onUsage?: UsageHandler
  provider?: 'anthropic' | 'openai-compatible'
  oaiStructuredMode?: 'json_schema' | 'json_object'
  model?: string
}

const ERROR_RESULT = (message: string): GatekeeperResult => ({ kind: 'ERROR', message })

// Parse retries for the model's reply shape. The wire dialect can only require
// `kind` (required fields differ per kind), so weak local models sometimes drop
// slot fields — feed the zod issues back instead of hard-erroring, the same
// recovery contract the Designer has. Transport errors never retry.
const MAX_PARSE_RETRIES = 2

export async function callGatekeeper(
  userMessage: string,
  history: ConvTurn[],
  opts: GatekeeperOptions,
): Promise<GatekeeperResult> {
  const system = buildGatekeeperPrompt(opts.registry, opts.config, opts.componentLibrary)
  const baseMessages: ConvTurn[] = [
    ...history,
    { role: 'user', content: userMessage },
  ]

  let retryTurns: ConvTurn[] = []
  let val: z.infer<typeof ModelReplySchema> | undefined

  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
    const result = await callClaude({
      apiKey: opts.apiKey,
      model: opts.model ?? GATEKEEPER_MODEL,
      system,
      messages: [...baseMessages, ...retryTurns],
      temperature: 0.1,
      maxTokens: 1024,
      outputSchema: GATEKEEPER_WIRE_SCHEMA as unknown as Record<string, unknown>,
      ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}),
      ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
      ...(opts.onUsage ? { onUsage: opts.onUsage } : {}),
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.oaiStructuredMode ? { oaiStructuredMode: opts.oaiStructuredMode } : {}),
    })

    if (!result.ok) {
      // Preserve v5 error wording for connection/transport errors
      return ERROR_RESULT('Connection error. Please try again.')
    }

    let issues: string
    try {
      const raw: unknown = JSON.parse(result.text)
      const parsed = ModelReplySchema.safeParse(raw)
      if (parsed.success) {
        val = parsed.data
        break
      }
      issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'reply'}: ${i.message}`).join('; ')
    } catch {
      issues = 'the reply was not valid JSON'
    }

    retryTurns = [
      { role: 'assistant', content: result.text },
      {
        role: 'user',
        content: `Your reply was invalid: ${issues}. Reply again with ONLY one JSON object carrying every field required for your chosen kind — slot kinds (SLOT_F1/F2/F3/F4) require slotName, level, and description; THEME requires description; CLARIFY/REJECT require message.`,
      },
    ]
  }

  if (val === undefined) {
    return ERROR_RESULT('Something went wrong. Try rephrasing your request.')
  }

  // THEME level gate: deterministic permission check, never delegated to the model
  if (val.kind === 'THEME') {
    if (!isThemeAllowed(opts.config)) {
      return {
        kind: 'REJECT',
        message: 'All pages are locked (level 0); whole-app theming requires at least one page unlocked to level 1+.',
      }
    }
    return { kind: 'THEME', description: val.description! }
  }

  if ((SLOT_KINDS as readonly string[]).includes(val.kind)) {
    const kind = val.kind as 'SLOT_F1' | 'F2' | 'F3' | 'F4'

    // Deterministic slot permission gate. The slotName must be canonical (the
    // prompt demands it; an invented name means the model misresolved — ask).
    const registered = opts.registry.find((s) => s.name === val.slotName)
    if (!registered) {
      return {
        kind: 'CLARIFY',
        message: `I couldn't match "${val.slotName!}" to a customizable area on this page. Which part do you mean?`,
      }
    }
    const required = KIND_LEVEL[kind]
    const pageLevel = opts.config.frontend?.pages?.[registered.pageName]?.level ?? 0
    const allowedLevel = Math.min(registered.level, pageLevel)
    if (required > allowedLevel) {
      return {
        kind: 'REJECT',
        message: `"${registered.name}" is locked for this kind of change: it needs level ${required} but the developer allows level ${allowedLevel} here.`,
      }
    }

    return {
      kind,
      slotName: val.slotName!,
      level: val.level!,
      description: val.description!,
      // Default requirements to [] per plan spec
      requirements: val.requirements ?? [],
    }
  }

  if (val.kind === 'CLARIFY') {
    return { kind: 'CLARIFY', message: val.message! }
  }

  if (val.kind === 'REJECT') {
    return { kind: 'REJECT', message: val.message! }
  }

  // Unreachable — zod enum ensures kind is one of the 7 values
  return ERROR_RESULT('Something went wrong. Try rephrasing your request.')
}
