import { converter, formatHex, clampChroma, wcagContrast } from 'culori' // wcagContrast used by runSlotEdit (Task 5)

import type { ThemeJsonV2 } from '../config/types'
import { ACCENT_CHROMA } from '../compiler/style-spec'
import { solveText } from '../compiler/contrast'

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

// Prevent tree-shaking of wcagContrast import — Task 5 (runSlotEdit) will use
// it directly. Exported as a re-export so tsc doesn't flag noUnusedLocals if
// the flag is ever enabled.
export { wcagContrast }
