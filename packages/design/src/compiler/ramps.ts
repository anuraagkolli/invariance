import { clampChroma, formatHex } from 'culori'

import { NEUTRAL_TINT_CHROMA, ACCENT_CHROMA } from './style-spec'
import type { StyleSpec } from './style-spec'

export interface OklchColor {
  mode: 'oklch'
  l: number
  c: number
  h: number
}

// Non-linear lightness scale: resolution concentrated near the light end where
// surface distinctions live. Spec-normative constant — golden tests depend on it.
export const L_SCALE = [0.98, 0.955, 0.92, 0.86, 0.78, 0.68, 0.57, 0.46, 0.36, 0.25, 0.15] as const
export const ACCENT_L_SCALE = [0.85, 0.75, 0.65, 0.55, 0.45] as const

// Warm and saturated hues go muddy at low lightness unless chroma backs off.
// These factors target L_SCALE indices 8-10 (the lowest-lightness steps) and
// apply to BOTH modes: they sit at the END of the light ramp and (after reversal)
// at the START of the dark ramp.
const DARK_STEP_CHROMA_FACTORS: Record<number, number> = { 8: 0.6, 9: 0.4, 10: 0.25 }

export function toHex(color: OklchColor): string {
  // formatHex silently clips out-of-gamut channels — always gamut-map first.
  return formatHex(clampChroma(color, 'oklch'))
}

export function neutralRamp(
  spec: Pick<StyleSpec, 'mode' | 'neutralTint' | 'neutralTintStrength'>,
): OklchColor[] {
  const baseChroma = NEUTRAL_TINT_CHROMA[spec.neutralTintStrength]
  const h = spec.neutralTint
  const ramp = L_SCALE.map((l, i): OklchColor => {
    const c = baseChroma * (DARK_STEP_CHROMA_FACTORS[i] ?? 1)
    // clampChroma may return h:undefined for achromatic (c≈0) colors; normalise to
    // the input hue so OklchColor.h is always a number and toHex can forward it.
    const clamped = clampChroma({ mode: 'oklch' as const, l, c, h }, 'oklch')
    return { mode: 'oklch', l: clamped.l, c: clamped.c, h: clamped.h ?? h }
  })
  // Light mode: L_SCALE is already descending (bright → dark).
  // Dark mode: reverse so index 0 is the darkest (near-black) step.
  return spec.mode === 'light' ? ramp : [...ramp].reverse()
}

export interface AccentSeed {
  l: number
  c: number
  h: number
}

export function accentRamp(
  spec: Pick<StyleSpec, 'mode' | 'accentHue' | 'accentChroma'>,
  seed?: AccentSeed,
  chromaMax?: number,
): OklchColor[] {
  // Apply dark-mode chroma reduction BEFORE clamping so the ×0.9 relationship
  // is exact on the pre-clamp value, not the post-clamp value.
  const darkFactor = spec.mode === 'dark' ? 0.9 : 1
  const h = seed?.h ?? spec.accentHue
  const rawChroma = seed?.c ?? ACCENT_CHROMA[spec.accentChroma]
  const c = Math.min(rawChroma, chromaMax ?? Infinity) * darkFactor
  // Scale offsets to the available headroom so steps stay distinct near the
  // clamp boundaries. For seed.l in [0.4, 0.75] this is identical to ±0.1/±0.2.
  // When seed.l is very close to 0.2 or 0.95 the headroom reaches 0 and the
  // outer steps legitimately merge — that is correct and expected.
  const ls: readonly number[] = seed
    ? (() => {
        const up = Math.min(0.1, (0.95 - seed.l) / 2)
        const down = Math.min(0.1, (seed.l - 0.2) / 2)
        return [
          seed.l + 2 * up,
          seed.l + up,
          seed.l,
          seed.l - down,
          seed.l - 2 * down,
        ]
      })()
    : [...ACCENT_L_SCALE]
  return ls.map((l): OklchColor => {
    // Normalise h after clamping for the same reason as neutralRamp.
    const clamped = clampChroma({ mode: 'oklch' as const, l, c, h }, 'oklch')
    return { mode: 'oklch', l: clamped.l, c: clamped.c, h: clamped.h ?? h }
  })
}
