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
// Level gate: THEME requires at least one page with level >= 1.
// Enforced deterministically here — never trust the model for permissions.
// ---------------------------------------------------------------------------

function isThemeAllowed(config: InvarianceConfig): boolean {
  const pages = config.frontend?.pages
  if (!pages) return false
  return Object.values(pages).some((p) => typeof p === 'object' && p !== null && (p as { level?: number }).level !== undefined && (p as { level: number }).level >= 1)
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
}

const ERROR_RESULT = (message: string): GatekeeperResult => ({ kind: 'ERROR', message })

export async function callGatekeeper(
  userMessage: string,
  history: ConvTurn[],
  opts: GatekeeperOptions,
): Promise<GatekeeperResult> {
  const system = buildGatekeeperPrompt(opts.registry, opts.config, opts.componentLibrary)
  const messages: ConvTurn[] = [
    ...history,
    { role: 'user', content: userMessage },
  ]

  const result = await callClaude({
    apiKey: opts.apiKey,
    model: GATEKEEPER_MODEL,
    system,
    messages,
    temperature: 0.1,
    maxTokens: 1024,
    outputSchema: GATEKEEPER_WIRE_SCHEMA as unknown as Record<string, unknown>,
    ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}),
    ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
    ...(opts.onUsage ? { onUsage: opts.onUsage } : {}),
  })

  if (!result.ok) {
    // Preserve v5 error wording for connection/transport errors
    return ERROR_RESULT('Connection error. Please try again.')
  }

  let raw: unknown
  try {
    raw = JSON.parse(result.text)
  } catch {
    return ERROR_RESULT('Something went wrong. Try rephrasing your request.')
  }

  const parsed = ModelReplySchema.safeParse(raw)
  if (!parsed.success) {
    return ERROR_RESULT('Something went wrong. Try rephrasing your request.')
  }

  const val = parsed.data

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
