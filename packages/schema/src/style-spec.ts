import { z } from 'zod'

// Designer output: structured design intent. NEVER raw token values —
// the Compiler picks every actual value (DESIGN.md 1.2).
export interface StyleSpec {
  mode: 'light' | 'dark'
  accentHue: number
  accentChroma: 'muted' | 'medium' | 'vivid'
  secondaryHue?: number
  neutralTint: number
  neutralTintStrength: 'none' | 'subtle' | 'strong'
  contrast: 'soft' | 'standard' | 'high'
  fontPairing: string
  radius: 'sharp' | 'subtle' | 'rounded' | 'pill'
  shadow: 'flat' | 'subtle' | 'pronounced' | 'hard-offset'
  density: 'compact' | 'standard' | 'comfortable'
  borderWeight: 'hairline' | 'standard' | 'heavy'
  // Optional in the interface so existing object literals (theme packs, fixtures)
  // keep compiling; the zod schema below defaults them on parse so older stored
  // theme JSON that predates these fields still loads. 'standard' is a valid
  // member of both enums.
  typography?: 'standard' | 'display-caps' | 'editorial' | 'technical'
  framing?: 'compact' | 'standard' | 'spacious'
  rationale: string
}

export const StyleSpecSchema = z.object({
  mode: z.enum(['light', 'dark']),
  accentHue: z.number().min(0).max(360),
  accentChroma: z.enum(['muted', 'medium', 'vivid']),
  secondaryHue: z.number().min(0).max(360).optional(),
  neutralTint: z.number().min(0).max(360),
  neutralTintStrength: z.enum(['none', 'subtle', 'strong']),
  contrast: z.enum(['soft', 'standard', 'high']),
  fontPairing: z.string().min(1),
  radius: z.enum(['sharp', 'subtle', 'rounded', 'pill']),
  shadow: z.enum(['flat', 'subtle', 'pronounced', 'hard-offset']),
  density: z.enum(['compact', 'standard', 'comfortable']),
  borderWeight: z.enum(['hairline', 'standard', 'heavy']),
  typography: z.enum(['standard', 'display-caps', 'editorial', 'technical']).default('standard'),
  framing: z.enum(['compact', 'standard', 'spacious']).default('standard'),
  rationale: z.string().min(1),
})

// Developer constraints consumed by compileTheme. YAML wiring is a later phase.
export interface DesignConstraints {
  contrast?: number
  accent_chroma_max?: number
  allowed_modes?: Array<'light' | 'dark'>
  locked_tokens?: Record<string, string>
  font_registry?: string[]
}

export const ACCENT_CHROMA = { muted: 0.08, medium: 0.15, vivid: 0.22 } as const satisfies Record<StyleSpec['accentChroma'], number>
export const NEUTRAL_TINT_CHROMA = { none: 0, subtle: 0.02, strong: 0.04 } as const satisfies Record<StyleSpec['neutralTintStrength'], number>
// Per-level body-text target. 'soft' equals 'standard' numerically: the 3.0
// large-text floor only applies to tokens explicitly marked large-text, and
// no Phase 1 token is.
export const CONTRAST_TARGETS = { soft: 4.5, standard: 4.5, high: 7.0 } as const satisfies Record<StyleSpec['contrast'], number>
