// culori v4 ships no .d.ts; this ambient declaration satisfies tsc under
// moduleResolution:Bundler. Only the subset used by this package is typed here.
// Expand as new culori functions are called from non-test source files.
declare module 'culori' {
  export interface Oklch {
    mode: 'oklch'
    l: number
    c: number
    h: number | undefined
  }

  export interface Hsl {
    mode: 'hsl'
    h: number | undefined
    s: number
    l: number
    alpha?: number
  }

  export interface Rgb {
    mode: 'rgb'
    r: number
    g: number
    b: number
    alpha?: number
  }

  type AnyColor = Oklch | Hsl | Rgb | { mode: string; [key: string]: unknown }

  export function clampChroma(color: AnyColor, mode: 'oklch'): Oklch
  export function clampChroma(color: AnyColor, mode: 'rgb'): AnyColor
  export function formatHex(color: AnyColor): string
  export function formatHsl(color: AnyColor): string
  export function formatRgb(color: AnyColor): string
  export function wcagContrast(a: string | AnyColor, b: string | AnyColor): number
  export function parse(color: string): AnyColor | undefined
  export function inGamut(mode: string): (color: AnyColor) => boolean
  // Overload for the 'oklch' mode — returns Oklch so callers can access l/c/h
  // as typed numbers without casting through AnyColor's index-signature branch.
  export function converter(mode: 'oklch'): (color: string | AnyColor) => Oklch
  export function converter(mode: 'hsl'): (color: string | AnyColor) => Hsl
  export function converter(mode: 'rgb'): (color: string | AnyColor) => Rgb
  export function converter(mode: string): (color: string | AnyColor) => AnyColor | undefined
}
