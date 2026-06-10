import { clampChroma, formatHex, wcagContrast } from 'culori'

// WCAG relative luminance recovered from the contrast-vs-black identity:
// contrast(x, black) = (L + 0.05) / 0.05. Keeps us on the verified API surface.
export function srgbLuminance(hex: string): number {
  return wcagContrast(hex, '#000000') * 0.05 - 0.05
}

export interface SolveOptions {
  hue: number
  chroma: number
  target: number
  rampLs?: readonly number[]
}

export interface SolveResult {
  hex: string
  ratio: number
  met: boolean
}

const candidate = (l: number, c: number, h: number): string =>
  formatHex(clampChroma({ mode: 'oklch', l, c, h }, 'oklch'))

// Binary search on OKLCH lightness. OKLCH l is perceptual, NOT WCAG luminance:
// the ratio must be recomputed on the gamut-mapped sRGB color every iteration.
//
// Direction: pick whichever extreme (black or white) achieves higher contrast.
// Using luminance > 0.5 is insufficient — mid-luminance accents like #e94560
// (lum ≈ 0.22) have higher contrast with black (5.48) than white (3.83), so the
// correct direction is dark text even though the surface is not "light" by the
// naive threshold. The crossover is at lum ≈ 0.179 (where both extremes equalize),
// but checking the actual contrast values is simpler and always correct.
function search(surfaceHex: string, hue: number, chroma: number, target: number): SolveResult | null {
  // searchDown = true means we want lower l (dark text); false = higher l (light text)
  const searchDown = wcagContrast('#000000', surfaceHex) >= wcagContrast('#ffffff', surfaceHex)
  const extremeL = searchDown ? 0 : 1
  const extremeHex = candidate(extremeL, chroma, hue)
  if (wcagContrast(extremeHex, surfaceHex) < target) return null

  // pass region is the interval between the extreme and the boundary l*
  // for searchDown: pass iff l <= l*, converge lo up toward l*
  // for !searchDown: pass iff l >= l*, converge hi down toward l*
  // best tracks the last passing candidate = the one closest to the boundary
  // (minimum sufficient contrast = most harmonious with the surface)
  let lo = 0
  let hi = 1
  let best: SolveResult = { hex: extremeHex, ratio: wcagContrast(extremeHex, surfaceHex), met: true }
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const hex = candidate(mid, chroma, hue)
    const ratio = wcagContrast(hex, surfaceHex)
    const pass = ratio >= target
    if (pass) best = { hex, ratio, met: true }
    if (searchDown) {
      // pass iff l <= l*: walk lo up into the pass region toward the boundary
      if (pass) lo = mid
      else hi = mid
    } else {
      // pass iff l >= l*: walk hi down toward the boundary
      if (pass) hi = mid
      else lo = mid
    }
  }
  return best
}

export function solveText(surfaceHex: string, opts: SolveOptions): SolveResult {
  for (const c of [opts.chroma, opts.chroma / 2, 0]) {
    const result = search(surfaceHex, opts.hue, c, opts.target)
    if (!result) continue
    if (opts.rampLs?.length) {
      // prefer a passing ramp step: solved text stays harmonious with the ramp
      const passing = opts.rampLs
        .map((l) => {
          const hex = candidate(l, c, opts.hue)
          return { hex, ratio: wcagContrast(hex, surfaceHex), met: true }
        })
        .filter((r) => r.ratio >= opts.target)
      if (passing.length) {
        // sort descending by ratio, then take the best (highest contrast ramp step)
        const sorted = [...passing].sort((a, b) => b.ratio - a.ratio)
        return sorted[0] as SolveResult
      }
    }
    return result
  }
  // unsatisfiable: best achievable extreme, flagged for the warnings path
  const searchDown = wcagContrast('#000000', surfaceHex) >= wcagContrast('#ffffff', surfaceHex)
  const hex = searchDown ? '#000000' : '#ffffff'
  return { hex, ratio: wcagContrast(hex, surfaceHex), met: false }
}
