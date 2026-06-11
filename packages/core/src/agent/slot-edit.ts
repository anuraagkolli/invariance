import { z } from 'zod'
import { converter, formatHex, clampChroma, wcagContrast } from 'culori'

import type { ThemeJsonV2, InvarianceConfig } from '../config/types'
import type { DesignConstraints } from '../compiler/style-spec'
import { ACCENT_CHROMA } from '../compiler/style-spec'
import { solveText } from '../compiler/contrast'
import type { SlotRegistration } from '../context/registry'
import { callClaude } from './api'
import type { UsageHandler } from './api'
import { SLOT_EDIT_MODEL } from './models'
import { slotEditWireSchema } from './wire-schemas'
import { buildSlotEditPrompt } from './slot-edit-prompt'
import { verifyV2 } from '../verify/compiled-tests'

const toOklch = converter('oklch')

// Slot-edit chroma vocabulary: StyleSpec's accent levels plus 'neutral' for
// gray/white/black requests. The model picks a level; this table picks the number.
export const SLOT_CHROMA = { neutral: 0, ...ACCENT_CHROMA } as const
export type SlotChromaLevel = keyof typeof SLOT_CHROMA

// Discrete lightness moves: the model says "darker", arithmetic decides how much.
export const LIGHTNESS_DELTA = {
  'much-darker': -0.3,
  darker: -0.15,
  same: 0,
  lighter: 0.15,
  'much-lighter': 0.3,
} as const
export type SlotLightness = keyof typeof LIGHTNESS_DELTA

// Slot tokens default to role references by convention (CLAUDE.md two-tier
// tokens). When theme.json carries no entry, the value the user actually sees
// is the app stylesheet's default var() — resolve through the same convention.

export type SlotVarKind = 'bg' | 'text' | 'border' | 'accent'

// Segment-aware classification: compound tokens like --inv-sidebar-text-secondary
// must classify as text, not by their last segment. Priority order resolves the
// (unlikely) case of multiple kind segments in one name.
const KIND_SEGMENTS: Array<[SlotVarKind, string[]]> = [
  ['bg', ['bg', 'background']],
  ['text', ['text', 'color']],
  ['border', ['border']],
  ['accent', ['accent']],
]

export function varKindOf(varName: string): SlotVarKind | null {
  const segments = varName.split('-')
  for (const [kind, names] of KIND_SEGMENTS) {
    if (segments.some((s) => names.includes(s))) return kind
  }
  return null
}

const DEFAULT_ROLE_FOR_KIND: Record<SlotVarKind, string> = {
  bg: '--inv-surface-1',
  text: '--inv-text-primary',
  border: '--inv-border',
  accent: '--inv-accent',
}

export function defaultRoleFor(varName: string): string {
  const kind = varKindOf(varName)
  return kind ? DEFAULT_ROLE_FOR_KIND[kind] : '--inv-surface-1'
}

// Widen to tolerate fallback clauses (var(--x, #fff)) and whitespace (var( --x ))
// so these legal CSS forms don't fall through as opaque literals.
const VAR_REF = /^var\(\s*(--[A-Za-z0-9-]+)\s*(?:,[^)]*)?\)$/

// Explicit literal > var() ref through roles > conventional default role.
// null when nothing resolves (fresh theme) — callers fall back to mid lightness.
export function resolveSlotVar(varName: string, theme: ThemeJsonV2): string | null {
  const slots = theme.theme?.slots ?? {}
  const roles = theme.theme?.roles ?? {}
  const entry = slots[varName]
  if (entry !== undefined) {
    const ref = VAR_REF.exec(entry)
    const target = ref?.[1]
    if (target === undefined) return entry
    return roles[target] ?? null
  }
  return roles[defaultRoleFor(varName)] ?? null
}

export interface SlotLiteralRequest {
  hue: number
  chromaLevel: SlotChromaLevel
  lightness: SlotLightness
  currentHex: string | null
  chromaMax?: number
}

// Deterministic value construction: lightness anchors to the current resolved
// value so the theme's lightness structure survives the edit; chroma is capped
// by the developer constraint; clampChroma gamut-maps before formatHex.
export function buildSlotLiteral(req: SlotLiteralRequest): string {
  const parsed = req.currentHex ? toOklch(req.currentHex) : undefined
  // parsed?.l is number|undefined — ?? gives a number in both branches
  const baseL: number = parsed?.l ?? 0.55
  const delta: number = LIGHTNESS_DELTA[req.lightness]
  const l = Math.min(0.97, Math.max(0.08, baseL + delta))
  const chromaFromLevel: number = SLOT_CHROMA[req.chromaLevel]
  const c = req.chromaMax !== undefined ? Math.min(chromaFromLevel, req.chromaMax) : chromaFromLevel
  return formatHex(clampChroma({ mode: 'oklch', l, c, h: req.hue }, 'oklch'))
}

export interface DependentTextResult {
  hex: string
  met: boolean
}

// When a slot background changes, its text token must keep meeting the
// developer's contrast floor. Keep the text's current hue character when it
// resolves; chroma stays near-neutral so solved text never outshouts the accent.
export function solveDependentText(
  newBgHex: string,
  currentTextHex: string | null,
  target: number,
): DependentTextResult {
  const parsed = currentTextHex ? toOklch(currentTextHex) : undefined
  // h and c are number|undefined in culori types — ?? 0 ensures a number
  const hue: number = parsed?.h ?? 0
  const rawC: number = parsed?.c ?? 0
  const chroma = Math.min(rawC, 0.04)
  const result = solveText(newBgHex, { hue, chroma, target })
  return { hex: result.hex, met: result.met }
}

const SlotEditReplySchema = z.object({
  targetVar: z.string(),
  hue: z.number().min(0).max(360),
  chromaLevel: z.enum(['neutral', 'muted', 'medium', 'vivid']),
  lightness: z.enum(['much-darker', 'darker', 'same', 'lighter', 'much-lighter']),
  explanation: z.string().min(1),
})

export interface SlotEditInput {
  intent: { slotName: string; description: string }
  currentV2: ThemeJsonV2
  registry: SlotRegistration[]
  constraints: DesignConstraints
  config: InvarianceConfig
  apiKey: string
  fetchFn?: typeof fetch
  baseUrl?: string
  onUsage?: UsageHandler
}

export type SlotEditOutcome =
  | { ok: true; candidate: ThemeJsonV2; explanation: string }
  | { ok: false; error: string }

const MISUNDERSTOOD = 'Could not understand the color request. Try rephrasing.'

export async function runSlotEdit(input: SlotEditInput): Promise<SlotEditOutcome> {
  const registration = input.registry.find((r) => r.name === input.intent.slotName)
  const vars = registration?.cssVariables ?? []
  if (vars.length === 0) {
    return { ok: false, error: 'This slot does not support style variables yet.' }
  }

  const system = buildSlotEditPrompt({
    slotName: input.intent.slotName,
    variables: vars.map((name) => ({ name, currentValue: resolveSlotVar(name, input.currentV2) })),
  })

  const result = await callClaude({
    apiKey: input.apiKey,
    // Micro-edit: a classification-sized job where latency matters most.
    model: SLOT_EDIT_MODEL,
    system,
    messages: [{ role: 'user', content: input.intent.description }],
    temperature: 0.1,
    maxTokens: 512,
    outputSchema: slotEditWireSchema(vars) as unknown as Record<string, unknown>,
    ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
    ...(input.onUsage ? { onUsage: input.onUsage } : {}),
  })
  if (!result.ok) return { ok: false, error: result.error }

  let raw: unknown
  try {
    raw = JSON.parse(result.text)
  } catch {
    return { ok: false, error: MISUNDERSTOOD }
  }
  const parsed = SlotEditReplySchema.safeParse(raw)
  if (!parsed.success || !vars.includes(parsed.data.targetVar)) {
    return { ok: false, error: MISUNDERSTOOD }
  }
  const pick = parsed.data

  // Deterministic guard: a slot literal would visually shadow a developer lock
  // (slots write to :root after roles), so locked vars are refused outright.
  if (input.constraints.locked_tokens?.[pick.targetVar] !== undefined) {
    return { ok: false, error: 'That value is locked by the developer and cannot be changed.' }
  }

  const currentHex = resolveSlotVar(pick.targetVar, input.currentV2)
  const literal = buildSlotLiteral({
    hue: pick.hue,
    chromaLevel: pick.chromaLevel,
    lightness: pick.lightness,
    currentHex,
    ...(input.constraints.accent_chroma_max !== undefined ? { chromaMax: input.constraints.accent_chroma_max } : {}),
  })

  const target = input.constraints.contrast ?? 4.5
  const newSlots: Record<string, string> = { [pick.targetVar]: literal }
  const kind = varKindOf(pick.targetVar)

  if (kind === 'bg') {
    // One coordinated micro-mutation: the sibling text token moves with its bg.
    const textVar = vars.find((v) => varKindOf(v) === 'text')
    if (textVar) {
      const lockedText = input.constraints.locked_tokens?.[textVar]
      if (lockedText !== undefined) {
        // The locked text cannot move with its background, so the background
        // must keep reading against it — verifyV2's contrast pairs only cover
        // role tokens, making this the sole guard for slot-level pairs.
        const ratio = wcagContrast(literal, lockedText)
        if (ratio !== undefined && ratio < target) {
          return { ok: false, error: 'That background would make the locked text unreadable. Try a different shade.' }
        }
      } else {
        const solved = solveDependentText(literal, resolveSlotVar(textVar, input.currentV2), target)
        if (!solved.met) {
          return { ok: false, error: 'Could not find an accessible text color for that background. Try a different shade.' }
        }
        newSlots[textVar] = solved.hex
      }
    }
  } else if (kind === 'text') {
    // The requested text color must read against the current background;
    // adjust its lightness minimally when it falls short.
    const bgVar = vars.find((v) => varKindOf(v) === 'bg')
    const bgHex = bgVar ? resolveSlotVar(bgVar, input.currentV2) : null
    if (bgHex) {
      const ratio = wcagContrast(literal, bgHex)
      // wcagContrast can return undefined if either input is unparseable; only
      // trigger the solver when we have a concrete ratio that falls short.
      if (ratio !== undefined && ratio < target) {
        const parsedLiteral = toOklch(literal)
        const solved = solveText(bgHex, { hue: parsedLiteral?.h ?? pick.hue, chroma: parsedLiteral?.c ?? 0, target })
        if (!solved.met) {
          return { ok: false, error: 'That text color cannot reach readable contrast here. Try a different color.' }
        }
        newSlots[pick.targetVar] = solved.hex
      }
    }
  }

  const candidate: ThemeJsonV2 = {
    version: 2,
    base_app_version: input.currentV2.base_app_version,
    theme: {
      roles: { ...(input.currentV2.theme?.roles ?? {}) },
      slots: { ...(input.currentV2.theme?.slots ?? {}), ...newSlots },
      ...(input.currentV2.theme?.styleSpec ? { styleSpec: input.currentV2.theme.styleSpec } : {}),
    },
  }
  if (input.currentV2.content !== undefined) candidate.content = input.currentV2.content
  if (input.currentV2.layout !== undefined) candidate.layout = input.currentV2.layout
  if (input.currentV2.components !== undefined) candidate.components = input.currentV2.components

  const verification = verifyV2(candidate, input.config, input.constraints)
  if (!verification.passed) {
    const failures = verification.results.filter((r) => !r.passed).map((r) => `${r.name}: ${r.message}`)
    return { ok: false, error: `The change failed verification: ${failures.join('; ')}` }
  }

  return { ok: true, candidate, explanation: pick.explanation }
}
